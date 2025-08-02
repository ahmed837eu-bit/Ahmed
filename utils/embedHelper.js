
const colorManager = require('./colorManager.js');
const { EmbedBuilder } = require('discord.js');

// دالة لإنشاء embed بلون تلقائي مع إعدادات افتراضية
function createStandardEmbed(title, description) {
    return colorManager.createEmbed()
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
}

// دالة لإنشاء embed للأخطاء
function createErrorEmbed(message) {
    return new EmbedBuilder()
        .setDescription(`❌ ${message}`)
        .setColor('#FF0000')
        .setTimestamp();
}

// دالة لإنشاء embed للنجاح
function createSuccessEmbed(message) {
    return new EmbedBuilder()
        .setDescription(`✅ ${message}`)
        .setColor('#00FF00')
        .setTimestamp();
}

// دالة لإنشاء embed للتحذير
function createWarningEmbed(message) {
    return new EmbedBuilder()
        .setDescription(`⚠️ ${message}`)
        .setColor('#FFA500')
        .setTimestamp();
}

// دالة لتحديث embed موجود بلون جديد
function updateEmbedColor(embed) {
    return colorManager.updateEmbedColor(embed);
}

module.exports = {
    createStandardEmbed,
    createErrorEmbed,
    createSuccessEmbed,
    createWarningEmbed,
    updateEmbedColor
};
