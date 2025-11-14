// models/Post.js
const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    author: {
        type: String,
        required: true,
        trim: true,
        maxlength: 50
    },
    content: {
        type: String,
        required: false,
        trim: true,
        maxlength: 280
    },
    likes: {
        type: Number,
        default: 0
    },
    likedBy: { 
        type: [String], // Array de nombres de usuario que dieron like
        default: []
    },
    mediaUrl: { // URL del archivo subido
        type: String,
        required: false
    },
    mediaType: { // 'image' o 'video'
        type: String,
        required: false
    },
    type: { // 'post', 'reply', o 'repost'
        type: String,
        enum: ['post', 'reply', 'repost'],
        default: 'post'
    },
    replyToId: { // ID del post padre para respuestas
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        required: false
    },
    repostOfId: { // ID del post original para reposts
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        required: false
    }
}, {
    timestamps: true // Agrega createdAt y updatedAt
});

module.exports = mongoose.model('Post', postSchema);