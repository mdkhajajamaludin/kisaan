const User = require('./src/models/User');

async function testUserCreation() {
  try {
    console.log('🔍 Testing user creation...');
    
    // Test creating a user
    const testUser = {
      firebase_uid: 'test-uid-123',
      email: 'dev.unity.cc@gmail.com',
      name: 'Test User',
      role: 'admin',
      phone: '',
      addresses: [],
      preferences: {}
    };
    
    // Check if user already exists by email
    let existingUser = await User.findByEmail(testUser.email);
    if (existingUser) {
      console.log('✅ User already exists by email:', existingUser);
      return existingUser;
    }
    
    // Check by Firebase UID
    existingUser = await User.findByFirebaseUid(testUser.firebase_uid);
    if (existingUser) {
      console.log('✅ User already exists by Firebase UID:', existingUser);
      return existingUser;
    }
    
    // Create new user
    const newUser = await User.create(testUser);
    console.log('✅ User created successfully:', newUser);
    
    return newUser;
    
  } catch (error) {
    console.error('❌ Error testing user creation:', error);
  }
}

testUserCreation();