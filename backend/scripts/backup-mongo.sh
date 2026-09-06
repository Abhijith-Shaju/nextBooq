#!/usr/bin/env bash
#
# Nightly logical backup of the application database to S3.
#
# The cluster is on Atlas M0, which has no snapshots of any kind, so without
# this a single bad query is unrecoverable. This is a stopgap until the
# cluster moves to a tier with point-in-time restore -- delete it then, and
# stop pretending a nightly dump is the same thing.
#
# Deliberately noisy about failure. An unmonitored backup script that has
# been writing 0 bytes since March is worse than no backup, because it buys
# confidence it has not earned. So: a dump smaller than BACKUP_MIN_BYTES is
# treated as a failure, the upload is read back before the local copy is
# deleted, and every run appends one greppable line to the log.
#
# Usage:
#   BACKUP_S3_BUCKET=my-bucket ./backup-mongo.sh
#
# Environment:
#   BACKUP_S3_BUCKET   required. Bucket name, no s3:// prefix.
#   BACKUP_S3_PREFIX   optional. Key prefix, default "mongo".
#   ENV_FILE           optional. Where to read MONGO_URI from.
#   BACKUP_LOG         optional. Log file, default ~/nextbooq-backup.log.
#   BACKUP_MIN_BYTES   optional. Floor for a plausible dump, default 10240.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BUCKET="${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET must be set}"
PREFIX="${BACKUP_S3_PREFIX:-mongo}"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/../.env}"
LOG="${BACKUP_LOG:-${HOME}/nextbooq-backup.log}"
MIN_BYTES="${BACKUP_MIN_BYTES:-10240}"

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
ARCHIVE="$(mktemp -t "nextbooq-backup-XXXXXX.archive.gz")"
KEY="${PREFIX}/${STAMP}.archive.gz"

cleanup() { rm -f "$ARCHIVE"; }
trap cleanup EXIT

# One line per run, so `tail` tells you the whole story. Never log the URI.
log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$LOG"; }

fail() {
  log "FAIL $*"
  echo "backup failed: $*" >&2
  exit 1
}

# Checked before anything else, and each with its own message: an absent
# flock would otherwise fail the lock below and report "another backup is
# still running", which is the wrong thing to go and investigate.
command -v flock >/dev/null || fail "flock is not installed (util-linux)"
command -v mongodump >/dev/null || fail "mongodump is not installed (mongodb-database-tools)"
command -v aws >/dev/null || fail "aws cli is not installed"

# Two runs overlapping would both dump the same data and race on the same
# log; a stalled one should block the next rather than pile up behind it.
LOCK="${TMPDIR:-/tmp}/nextbooq-backup.lock"
exec 9>"$LOCK"
flock -n 9 || fail "another backup is still running"

[ -r "$ENV_FILE" ] || fail "cannot read env file at ${ENV_FILE}"

# Parsed rather than sourced: .env holds secrets with characters a shell
# would happily interpret, and sourcing it would also pull every unrelated
# variable into this process.
MONGO_URI="$(grep -E '^MONGO_URI=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
MONGO_URI="${MONGO_URI%\"}"; MONGO_URI="${MONGO_URI#\"}"
MONGO_URI="${MONGO_URI%\'}"; MONGO_URI="${MONGO_URI#\'}"
MONGO_URI="${MONGO_URI%$'\r'}"

[ -n "$MONGO_URI" ] || fail "MONGO_URI not found in ${ENV_FILE}"

mongodump --uri="$MONGO_URI" --gzip --archive="$ARCHIVE" --quiet \
  || fail "mongodump exited non-zero"

SIZE="$(wc -c <"$ARCHIVE" | tr -d ' ')"

# The failure this catches: credentials still valid, mongodump still exits 0,
# but it dumped an empty or near-empty database because it connected to the
# wrong place. Size is a blunt check, but it is the one that would have
# caught every silent-backup story worth learning from.
[ "$SIZE" -ge "$MIN_BYTES" ] || fail "dump implausibly small: ${SIZE} bytes (floor ${MIN_BYTES})"

aws s3 cp "$ARCHIVE" "s3://${BUCKET}/${KEY}" --only-show-errors \
  || fail "upload to s3://${BUCKET}/${KEY} failed"

# Read it back. `aws s3 cp` exiting 0 is not proof the object is retrievable,
# and the whole value of this script is in the object being there later.
REMOTE_SIZE="$(aws s3api head-object --bucket "$BUCKET" --key "$KEY" \
  --query 'ContentLength' --output text 2>/dev/null)" \
  || fail "uploaded object not readable back at s3://${BUCKET}/${KEY}"

[ "$REMOTE_SIZE" = "$SIZE" ] \
  || fail "size mismatch: local ${SIZE}, remote ${REMOTE_SIZE}"

log "ok bytes=${SIZE} key=${KEY}"
echo "backup ok: ${SIZE} bytes -> s3://${BUCKET}/${KEY}"
