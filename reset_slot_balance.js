import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_CONNECTION_STRING;

if (!MONGODB_URI) {
  console.error('MONGODB_CONNECTION_STRING is required');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to DB');
  const db = mongoose.connection.db;
  try {
    const result = await db.collection('slot_user_balance').deleteMany({});
    console.log('Deleted slot_user_balance documents:', result.deletedCount);
  } catch (e) {
    console.log('Error dropping collection:', e);
  }
  await mongoose.disconnect();
}

run();
