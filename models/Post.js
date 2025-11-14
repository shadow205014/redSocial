// models/Post.js
const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    // El contenido no es obligatorio si es un repost
    required: function() { return !this.originalPost; }, 
    trim: true,
    maxlength: 280
  },
  likes: {
    type: Number,
    default: 0
  },
  // --- Lógica para Reposts/Retweets ---
  originalPost: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Post', postSchema);