# Database backups

The Atlas cluster is on **M0**, which has no snapshots, no point-in-time
restore, and no way to undo anything. Without the script in
`backend/scripts/backup-mongo.sh`, a single mistyped `deleteMany` takes
every reservation, payment record and encrypted café Razorpay credential
with it, permanently.

This is a stopgap. It gets the worst case down from "everything" to "up to
24 hours". When the cluster moves to a tier with real point-in-time
restore, delete the cron and this document rather than keeping both — two
backup systems where one is unmonitored is worse than one.

Note also that the privacy policy commits to retaining reservation and
deposit records for 8 years for tax purposes. That is a promise this
stopgap only partially supports.

---

## One-time setup

### 1. Install the tools on the EC2 box

`mongodump` is not part of the mongo shell package and is not installed by
default:

```bash
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb.gpg
echo "deb [signed-by=/usr/share/keyrings/mongodb.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb.list
sudo apt update && sudo apt install -y mongodb-database-tools
```

AWS CLI v2. A stock Ubuntu server image has no `unzip`, and the installer
is only distributed as a zip, so install that first:

```bash
sudo apt install -y unzip
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscli.zip
unzip -q awscli.zip && sudo ./aws/install && rm -rf awscli.zip aws/
```

Check it took, since the installer is quiet on success:

```bash
aws --version
```

### 2. Create the bucket

In `ap-south-1`, same region as everything else. Then:

- **Block all public access** — on, without exception
- **Default encryption** — SSE-S3 is enough
- **Lifecycle rule** — expire objects under `mongo/` after 30 days, so
  storage cost stays flat instead of growing forever
- **Versioning** — optional, but it means an overwrite can't destroy an
  older backup

### 3. Give the instance an IAM role

Attach a role to the EC2 instance rather than putting access keys in a
file. The script picks the role up automatically through the instance
metadata service.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::YOUR-BUCKET/mongo/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::YOUR-BUCKET"
    }
  ]
}
```

**There is deliberately no `s3:DeleteObject`.** Someone who compromises the
API box can read and write backups but cannot destroy them, and the
lifecycle rule handles expiry instead. Backups an attacker can delete are
not much use against the attacker.

### 4. Schedule it

```bash
crontab -e
```

```
30 20 * * * BACKUP_S3_BUCKET=YOUR-BUCKET /home/ubuntu/nextBooq/backend/scripts/backup-mongo.sh >/dev/null 2>&1
```

20:30 UTC is 02:00 IST — after even a late café has closed its books.
`cron` mails stderr locally on failure; the log below is the thing to
actually check.

---

## Checking it works

Every run appends one line:

```bash
tail -5 ~/nextbooq-backup.log
```

```
2026-09-07T20:30:04Z ok bytes=2841002 key=mongo/2026-09-07T20-30-01Z.archive.gz
```

Two things to look for, and they are both about the failure mode where a
backup exists but is worthless:

- **Any `FAIL` line.** The script exits non-zero on a `mongodump` error, a
  dump smaller than 10 KB, an upload failure, or an uploaded object it
  cannot read back at the right size.
- **`bytes=` shrinking.** Your data only grows. A dump that suddenly halves
  means something is not being captured, and no error will tell you.

Glance at it weekly. This is the weakest part of the arrangement and the
honest reason to prefer a managed tier once revenue allows.

---

## Restoring

### Fetch a backup

```bash
aws s3 ls s3://YOUR-BUCKET/mongo/
aws s3 cp s3://YOUR-BUCKET/mongo/2026-09-07T20-30-01Z.archive.gz ./restore.archive.gz
```

### Restore it somewhere safe first

**Never restore straight over production.** Restore into a local `mongod`,
inspect it, and only then decide what to copy back. Restoring into Atlas
alongside the live data is also a bad idea on M0, where the 512 MB ceiling
is shared with the copy you just made.

```bash
mongorestore --uri="mongodb://localhost:27017" --gzip --archive=./restore.archive.gz --nsFrom='nextbooq.*' --nsTo='nextbooq_restored.*'
```

Then check it holds what you expect:

```bash
mongosh "mongodb://localhost:27017/nextbooq_restored" --eval 'db.getCollectionNames().forEach(c => print(c, db[c].countDocuments()))'
```

### Test this before you need it

An untested backup is a guess. Run the restore once, now, while nothing is
wrong — the point is to discover a broken dump on a quiet evening rather
than during an incident.

Reservation counts in the restored copy should roughly match production.
If `mongorestore` errors, or a collection is missing, or counts are
implausible, the backups are not working and the log will not have told
you.
