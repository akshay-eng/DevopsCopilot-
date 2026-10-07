const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  isEmailVerified: {
    type: Boolean,
    default: false  // Users must verify email before accessing the app
  },
  // Access role for RBAC. Admins can invite/manage users.
  role: {
    type: String,
    enum: ['Admin', 'Editor', 'Viewer'],
    default: 'Admin'
  },
  // Set when a user was invited by an admin (vs self-registered).
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // True for invited users until they change the temporary password.
  mustChangePassword: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpire: Date,
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  onboardingCompleted: {
    type: Boolean,
    default: false
  },
  onboardingData: {
    // Step 1: Cluster Setup
    clusterName: String,
    clusterType: String, // eks, gke, aks, self-hosted, etc.
    hasPrometheus: Boolean,
    hasGrafana: Boolean,

    // Step 2: Installation
    helmChartInstalled: Boolean,
    installationCompletedAt: Date,

    // Step 3: Connectivity
    connectionStatus: {
      type: String,
      enum: ['pending', 'connected', 'failed'],
      default: 'pending'
    },
    connectedAt: Date,

    // Step 4: Referral Source
    foundUsThrough: String, // search, friend, social-media, blog, etc.

    // Completion
    completedAt: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function() {
  // Only hash if password is modified
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate email verification token
userSchema.methods.generateEmailVerificationToken = function() {
  const verificationToken = crypto.randomBytes(32).toString('hex');

  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');

  this.emailVerificationExpire = Date.now() + parseInt(process.env.EMAIL_VERIFY_EXPIRE || 86400000); // 24 hours

  return verificationToken;
};

// Generate password reset token
userSchema.methods.generateResetPasswordToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.resetPasswordExpire = Date.now() + parseInt(process.env.RESET_PASSWORD_EXPIRE || 3600000); // 1 hour

  return resetToken;
};

module.exports = mongoose.model('User', userSchema);
