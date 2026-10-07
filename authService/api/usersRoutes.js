/**
 * User management routes — external-user onboarding for the Settings → Users tab.
 *
 * An Admin invites a user by email + role; the user is created (pre-verified so
 * they can sign in immediately, onboarding skipped since they join an existing
 * workspace) with a generated temporary password, and an invite email with the
 * login link + credentials is sent.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const { sendInviteEmail } = require('../utils/emailServiceResend');

const ROLES = ['Admin', 'Editor', 'Viewer'];

// Only Admins (or legacy users with no role set) may manage users.
function requireAdmin(req, res, next) {
  const role = req.user?.role;
  if (role && role !== 'Admin') {
    return res.status(403).json({ success: false, error: 'Admin role required' });
  }
  next();
}

// Generate a readable but strong temporary password.
function genTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = crypto.randomBytes(10);
  for (let i = 0; i < 10; i++) out += chars[bytes[i] % chars.length];
  // guarantee complexity
  return `${out}#${crypto.randomInt(10, 99)}`;
}

const shape = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  role: u.role || 'Admin',
  status: u.isEmailVerified ? 'Active' : 'Pending',
  mustChangePassword: !!u.mustChangePassword,
  createdAt: u.createdAt,
});

// GET /api/users — list users in the workspace
router.get('/', protect, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: 1 }).select('name email role isEmailVerified mustChangePassword createdAt');
    res.json({ success: true, users: users.map(shape), roles: ROLES });
  } catch (e) {
    console.error('List users error:', e.message);
    res.status(500).json({ success: false, error: 'Failed to list users' });
  }
});

// POST /api/users/invite — invite an external user
router.post('/invite', protect, requireAdmin, async (req, res) => {
  try {
    const { email, name, role } = req.body || {};
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });
    const cleanEmail = String(email).toLowerCase().trim();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return res.status(400).json({ success: false, error: 'Invalid email' });
    const chosenRole = ROLES.includes(role) ? role : 'Viewer';

    const existing = await User.findOne({ email: cleanEmail });
    if (existing) return res.status(409).json({ success: false, error: 'A user with this email already exists' });

    const tempPassword = genTempPassword();
    const user = await User.create({
      name: name?.trim() || cleanEmail.split('@')[0],
      email: cleanEmail,
      password: tempPassword,       // hashed by the pre-save hook
      role: chosenRole,
      isEmailVerified: true,         // invited users are pre-verified
      onboardingCompleted: true,     // they join an existing workspace
      mustChangePassword: true,
      invitedBy: req.user._id,
    });

    let emailSent = false;
    let emailError = null;
    try {
      await sendInviteEmail(user, {
        tempPassword,
        role: chosenRole,
        loginUrl: `${process.env.FRONTEND_URL || ''}/login`,
        inviterName: req.user.name,
      });
      emailSent = true;
    } catch (e) {
      emailError = e.message;
    }

    res.status(201).json({
      success: true,
      user: shape(user),
      emailSent,
      emailError,
      // Returned once so the admin can share it manually if email delivery is off.
      tempPassword: emailSent ? undefined : tempPassword,
    });
  } catch (e) {
    console.error('Invite user error:', e.message);
    res.status(500).json({ success: false, error: e.message || 'Failed to invite user' });
  }
});

// PATCH /api/users/:id/role — change a user's role
router.patch('/:id/role', protect, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!ROLES.includes(role)) return res.status(400).json({ success: false, error: 'Invalid role' });
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, user: shape(user) });
  } catch (e) {
    console.error('Update role error:', e.message);
    res.status(500).json({ success: false, error: 'Failed to update role' });
  }
});

// DELETE /api/users/:id — remove a user
router.delete('/:id', protect, requireAdmin, async (req, res) => {
  try {
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ success: false, error: 'You cannot remove your own account' });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true });
  } catch (e) {
    console.error('Delete user error:', e.message);
    res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
});

module.exports = router;
