const CafeApplication = require('../../src/models/CafeApplication');
const User = require('../../src/models/User');
const { setupTestDB } = require('../setup');

setupTestDB();

const makeUser = (email, phone) =>
  User.create({ name: 'Applicant', email, phone, password_hash: 'x' });

const applicationFor = (user, overrides = {}) => ({
  application_ref: 'NB-7K2M-9QRT',
  applicant_user_id: user._id,
  organization_name: 'Filter Kaapi Co',
  cafe_name: 'Filter Kaapi',
  cafe_slug: 'filter-kaapi',
  timezone: 'Asia/Kolkata',
  address: { line1: '12 Church Street', city: 'Bengaluru', state: 'Karnataka', postal_code: '560001' },
  ...overrides,
});

describe('CafeApplication model', () => {
  test('defaults a new application to pending', async () => {
    const user = await makeUser('model-a@example.com', '+15550130001');
    const application = await CafeApplication.create(applicationFor(user));
    expect(application.status).toBe('pending');
    expect(application.reviewed_at).toBeNull();
    expect(application.provisioned_cafe_id).toBeNull();
  });

  test('rejects a second pending application from the same user', async () => {
    const user = await makeUser('model-b@example.com', '+15550130002');
    await CafeApplication.init();
    await CafeApplication.create(applicationFor(user));

    await expect(
      CafeApplication.create(applicationFor(user, { application_ref: 'NB-AAAA-BBBB', cafe_slug: 'second-cafe' }))
    ).rejects.toMatchObject({ code: 11000 });
  });

  test('allows a new application once the previous one is rejected', async () => {
    const user = await makeUser('model-c@example.com', '+15550130003');
    await CafeApplication.init();
    const first = await CafeApplication.create(applicationFor(user));
    first.status = 'rejected';
    first.review_note = 'Could not verify the address';
    await first.save();

    const second = await CafeApplication.create(
      applicationFor(user, { application_ref: 'NB-CCCC-DDDD', cafe_slug: 'retry-cafe' })
    );
    expect(second.status).toBe('pending');
  });

  test('rejects a duplicate application_ref', async () => {
    const one = await makeUser('model-d@example.com', '+15550130004');
    const two = await makeUser('model-e@example.com', '+15550130005');
    await CafeApplication.init();
    await CafeApplication.create(applicationFor(one));

    await expect(
      CafeApplication.create(applicationFor(two, { cafe_slug: 'other-cafe' }))
    ).rejects.toMatchObject({ code: 11000 });
  });

  test('rejects an unknown status', async () => {
    const user = await makeUser('model-f@example.com', '+15550130006');
    await expect(
      CafeApplication.create(applicationFor(user, { status: 'maybe' }))
    ).rejects.toThrow(/status/);
  });
});
