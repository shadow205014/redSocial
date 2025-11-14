// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    maxlength: 30
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  displayName: { 
    type: String,
    required: true,
    maxlength: 50
  },
  profilePictureUrl: {
    type: String,
    // Una imagen de marcador de posición por defecto
    default: 'https://via.placeholder.com/150' 
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hook para hashear la contraseña
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Método para comparar contraseñas
UserSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);