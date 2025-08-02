const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

const name = 'cooldown';

// مسارات الملفات
const cooldownsPath = path.join(__dirname, '..', 'data', 'cooldowns.json');

// User cooldowns للتتبع - سيتم حفظها في JSON
const userCooldowns = new Map();

function loadCooldowns() {
    try {
        if (fs.existsSync(cooldownsPath)) {
            const data = fs.readFileSync(cooldownsPath, 'utf8');
            return JSON.parse(data);
        }
        return { default: 60000, responsibilities: {}, userCooldowns: {} };
    } catch (error) {
        console.error('خطأ في قراءة cooldowns:', error);
        return { default: 60000, responsibilities: {}, userCooldowns: {} };
    }
}

function saveCooldowns(cooldownData) {
    try {
        fs.writeFileSync(cooldownsPath, JSON.stringify(cooldownData, null, 2));
        console.log('✅ تم حفظ إعدادات الكولداون في JSON');
        return true;
    } catch (error) {
        console.error('خطأ في حفظ cooldowns:', error);
        return false;
    }
}

// دالة لحفظ الكولداونات المؤقتة
function saveUserCooldowns() {
    const cooldowns = loadCooldowns();
    const userCooldownsObj = {};

    // تحويل Map إلى object للحفظ
    for (const [key, value] of userCooldowns.entries()) {
        userCooldownsObj[key] = value;
    }

    cooldowns.userCooldowns = userCooldownsObj;
    saveCooldowns(cooldowns);
}

// دالة لتحميل الكولداونات المؤقتة
function loadUserCooldowns() {
    const cooldowns = loadCooldowns();
    if (cooldowns.userCooldowns) {
        userCooldowns.clear();
        // تحويل object إلى Map
        for (const [key, value] of Object.entries(cooldowns.userCooldowns)) {
            // فقط إذا لم تنته صلاحية الكولداون
            if (Date.now() < value + 86400000) { // 24 ساعة كحد أقصى
                userCooldowns.set(key, value);
            }
        }
    }
}

function checkCooldown(userId, responsibilityName) {
    const key = `${userId}_${responsibilityName}`;
    const now = Date.now();
    const cooldowns = loadCooldowns();
    
    // Safe access to prevent undefined errors
    const responsibilities = cooldowns.responsibilities || {};
    const cooldownTime = responsibilities[responsibilityName] || cooldowns.default || 60000;

    if (userCooldowns.has(key)) {
        const lastUsed = userCooldowns.get(key);
        const timeLeft = (lastUsed + cooldownTime) - now;
        if (timeLeft > 0) {
            return timeLeft;
        }
    }
    return 0;
}

function startCooldown(userId, responsibilityName) {
    const key = `${userId}_${responsibilityName}`;
    userCooldowns.set(key, Date.now());
    // حفظ فوري للكولداونات المؤقتة
    saveUserCooldowns();
}

async function execute(message, args, { responsibilities, client, saveData, BOT_OWNERS, colorManager }) {
    // تحميل الكولداونات المؤقتة من JSON
    loadUserCooldowns();

    const isOwner = BOT_OWNERS.includes(message.author.id) || message.guild.ownerId === message.author.id;
    if (!isOwner) {
        await message.react('❌');
        return;
    }

    // إنشاء الإيمبد الديناميكي
    function createMainEmbed() {
        const embed = colorManager.createEmbed()
            .setTitle('إعدادات الـ Cooldown')
            .setDescription('اختر ما تريد فعله مع إعدادات الـ cooldown')
            .addFields([
                { name: '**الـ Cooldown الافتراضي**', value: `**${(cooldowns.default || 60000) / 1000} ثانية**`, inline: true },
                { name: '**عدد المسؤوليات المخصصة**', value: `**${Object.keys(cooldowns.responsibilities || {}).length}**`, inline: true }
            ])
            .setThumbnail('https://cdn.discordapp.com/attachments/1393840634149736508/1398089589574602852/download-removebg-preview.png?ex=688417e5&is=6882c665&hm=eef26c389f42a3a391494f38bbac2d18530ff938320f130d288c3b1501104ebe&');

        const cooldowns = loadCooldowns();
        return embed;
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('cooldown_set_default')
            .setLabel('Set main')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('cooldown_set_responsibility')
            .setLabel('Responsibilities')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('cooldown_view')
            .setLabel('Settings')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('cooldown_reset')
            .setLabel(' Reset')
            .setStyle(ButtonStyle.Secondary)
    );

    const sentMessage = await message.channel.send({ embeds: [createMainEmbed()], components: [row] });

    // Create collector to update embed when needed
    const filter = i => i.user.id === message.author.id && i.message.id === sentMessage.id;
    const collector = message.channel.createMessageComponentCollector({ filter, time: 300000 });

    collector.on('collect', async interaction => {
        // تحديث الرسالة بعد كل تفاعل
        setTimeout(async () => {
            try {
                await sentMessage.edit({ embeds: [createMainEmbed()], components: [row] });
            } catch (error) {
                console.log('لا يمكن تحديث الرسالة:', error.message);
            }
        }, 1000);
    });

    collector.on('end', () => {
        const disabledRow = new ActionRowBuilder().addComponents(
            row.components.map(button => ButtonBuilder.from(button).setDisabled(true))
        );
        sentMessage.edit({ components: [disabledRow] }).catch(console.error);
    });
}

async function handleInteraction(interaction, client, saveData, responsibilities, colorManager) {
    try {
        // إنشاء دالة الإيمبد الديناميكي
        function createMainEmbed() {
            const cooldowns = loadCooldowns();
            const embed = colorManager.createEmbed()
                .setTitle('إعدادات الـ Cooldown')
                .setDescription('اختر ما تريد فعله مع إعدادات الـ cooldown')
                .addFields([
                    { name: '**الـ Cooldown الافتراضي**', value: `**${(cooldowns.default || 60000) / 1000} ثانية**`, inline: true },
                    { name: '**عدد المسؤوليات المخصصة**', value: `**${Object.keys(cooldowns.responsibilities || {}).length}**`, inline: true }
                ])
                .setThumbnail('https://cdn.discordapp.com/attachments/1393840634149736508/1398089589574602852/download-removebg-preview.png?ex=688417e5&is=6882c665&hm=eef26c389f42a3a391494f38bbac2d18530ff938320f130d288c3b1501104ebe&');

            return embed;
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('cooldown_set_default')
                .setLabel('Set main')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('cooldown_set_responsibility')
                .setLabel('responsibilities')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('cooldown_view')
                .setLabel('Settings')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('cooldown_reset')
                .setLabel('reset')
                .setStyle(ButtonStyle.Secondary)
        );
        if (interaction.customId === 'cooldown_set_default') {
            const cooldowns = loadCooldowns();
            const defaultEmbed = colorManager.createEmbed()
                .setDescription(`**يرجى إدخال الوقت الافتراضي للكولداون بالثواني:**\n\`الوقت الحالي: ${(cooldowns.default || 60000) / 1000} ثانية\``)
                .setThumbnail('https://cdn.discordapp.com/attachments/1398303368275038279/1398984234340847708/passage-of-time-icon-on-transparent-background-free-png.png?ex=68875919&is=68860799&hm=eb8e4ca9df98a147002078f9e41fe494db87d82d94b569481d29fdf0f477a276&');

            await interaction.reply({
                embeds: [defaultEmbed],
                ephemeral: true
            });

            const filter = m => m.author.id === interaction.user.id;
            const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

            collector.on('collect', async (msg) => {
                const timeValue = parseInt(msg.content.trim());

                if (isNaN(timeValue) || timeValue < 1) {
                    await interaction.followUp({
                        content: '**❌ يرجى إدخال رقم صحيح أكبر من أو يساوي 1 ثانية !**',
                        ephemeral: true
                    });
                    return;
                }

                const timeInMs = timeValue * 1000;
                const cooldowns = loadCooldowns();
                cooldowns.default = timeInMs;
                saveCooldowns(cooldowns);

                await interaction.followUp({
                    content: `**✅ تم تعيين الـ cooldown الافتراضي إلى __${timeValue}__ ثانية بنجاح !**`,
                    ephemeral: true
                });

                // تحديث الرسالة الأساسية
                setTimeout(async () => {
                    try {
                        const mainMessage = interaction.message.channel.messages.cache.find(msg => 
                            msg.embeds.length > 0 && msg.embeds[0].title === 'إعدادات الـ Cooldown'
                        );
                        if (mainMessage) {
                            await mainMessage.edit({ embeds: [createMainEmbed()], components: [row] });
                        }
                    } catch (error) {
                        console.log('لا يمكن تحديث الرسالة الأساسية:', error.message);
                    }
                }, 500);

                // Delete user's message
                try {
                    await msg.delete();
                } catch (error) {
                    console.log('لا يمكن حذف الرسالة:', error.message);
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    interaction.followUp({
                        content: '**انتهت المهلة الزمنية للإدخال.**',
                        ephemeral: true
                    }).catch(() => {});
                }
            });

        } else if (interaction.customId === 'cooldown_set_responsibility') {
            if (!responsibilities || Object.keys(responsibilities).length === 0) {
                return interaction.reply({ 
                    content: '- ** لا توجد مسؤوليات اصلا **', 
                    ephemeral: true 
                });
            }

            const options = Object.keys(responsibilities).map(resp => ({
                label: resp,
                description: `تعيين cooldown لـ ${resp}`,
                value: resp
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('cooldown_select_responsibility')
                .setPlaceholder('اختر المسؤولية')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.reply({
                content: '**اختر المسؤولية التي تريد تعيين cooldown لها :**',
                components: [row],
                ephemeral: true
            });

        } else if (interaction.customId === 'cooldown_view') {
            const cooldowns = loadCooldowns();
            let description = `**الـ Cooldown الافتراضي:** ${(cooldowns.default || 60000) / 1000} ثانية\n\n`;

            if (cooldowns.responsibilities && Object.keys(cooldowns.responsibilities).length > 0) {
                description += '**مسؤوليات مخصصة:**\n';
                for (const [resp, time] of Object.entries(cooldowns.responsibilities)) {
                    description += `• **${resp}:** ${time / 1000} ثانية\n`;
                }
            } else {
                description += '**لا توجد مسؤوليات مخصصة**';
            }

            const embed = colorManager.createEmbed()
                .setTitle('إعدادات الـ Cooldown الحالية')
                .setDescription(description)
                .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400637278900191312/images__7_-removebg-preview.png?ex=688d5c9d&is=688c0b1d&hm=8d5c6d761dcf9bda65af44b9de09a2817cbc273f061eb1e39cc8ac20de37cfc0&');

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (interaction.customId === 'cooldown_reset') {
            const resetCooldowns = { default: 60000, responsibilities: {}, userCooldowns: {} };
            saveCooldowns(resetCooldowns);
            userCooldowns.clear();

            await interaction.reply({ 
                content: '**✅ تم إعادة تعيين جميع إعدادات الـ cooldown إلى الافتراضية !**', 
                ephemeral: true 
            });

            // تحديث الرسالة الأساسية فوراً
            setTimeout(async () => {
                try {
                    await interaction.message.edit({ embeds: [createMainEmbed()], components: [row] });
                } catch (error) {
                    console.log('لا يمكن تحديث الرسالة الأساسية:', error.message);
                }
            }, 500);

        } else if (interaction.customId === 'cooldown_select_responsibility') {
            const selectedResp = interaction.values[0];
            const cooldowns = loadCooldowns();
            const currentTime = cooldowns.responsibilities[selectedResp] || cooldowns.default || 60000;

            await interaction.reply({
                content: `**يرجى إدخال الوقت للمسؤولية "${selectedResp}" بالثواني:**\n\`الوقت الحالي: ${currentTime / 1000} ثانية\``,
                ephemeral: true
            });

            const filter = m => m.author.id === interaction.user.id;
            const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

            collector.on('collect', async (msg) => {
                const timeValue = parseInt(msg.content.trim());

                if (isNaN(timeValue) || timeValue < 1) {
                    await interaction.followUp({
                        content: '**❌ يرجى إدخال رقم صحيح أكبر من أو يساوي 1 ثانية!**',
                        ephemeral: true
                    });
                    return;
                }

                const timeInMs = timeValue * 1000;
                const cooldowns = loadCooldowns();

                if (!cooldowns.responsibilities) {
                    cooldowns.responsibilities = {};
                }

                cooldowns.responsibilities[selectedResp] = timeInMs;
                saveCooldowns(cooldowns);

                await interaction.followUp({
                    content: `**✅ تم تعيين cooldown لـ ${selectedResp} إلى __${timeValue}__ ثانية بنجاح!**`,
                    ephemeral: true
                });

                // تحديث الرسالة الأساسية
                setTimeout(async () => {
                    try {
                        const mainMessage = interaction.message.channel.messages.cache.find(msg => 
                            msg.embeds.length > 0 && msg.embeds[0].title === 'إعدادات الـ Cooldown'
                        );
                        if (mainMessage) {
                            await mainMessage.edit({ embeds: [createMainEmbed()], components: [row] });
                        }
                    } catch (error) {
                        console.log('لا يمكن تحديث الرسالة الأساسية:', error.message);
                    }
                }, 500);

                // Delete user's message
                try {
                    await msg.delete();
                } catch (error) {
                    console.log('لا يمكن حذف الرسالة:', error.message);
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    interaction.followUp({
                        content: '**انتهت المهلة الزمنية للإدخال.**',
                        ephemeral: true
                    }).catch(() => {});
                }
            });
        }

    } catch (error) {
        console.error('خطأ في معالجة تفاعل cooldown:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
                content: '❌ حدث خطأ أثناء معالجة طلبك!', 
                ephemeral: true 
            });
        }
    }
}

module.exports = { 
    name, 
    execute, 
    handleInteraction,
    checkCooldown, 
    startCooldown 
};