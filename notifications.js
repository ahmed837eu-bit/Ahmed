const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const colorManager = require('../colorManager');
const { logEvent } = require('../logs_system');
const fs = require('fs');
const path = require('path');

const name = 'notifications';

// مسار ملف الإشعارات
const notificationsPath = path.join(__dirname, '..', 'data', 'notifications.json');

function loadNotificationsConfig() {
    try {
        if (fs.existsSync(notificationsPath)) {
            const data = fs.readFileSync(notificationsPath, 'utf8');
            const parsed = JSON.parse(data);
            // التأكد من وجود البنية الأساسية
            return {
                settings: {
                    enabled: parsed.settings?.enabled || false,
                    reminderDelay: parsed.settings?.reminderDelay || 5,
                    customResponsibilityTime: parsed.settings?.customResponsibilityTime || {}
                },
                activeReminders: parsed.activeReminders || {},
                pendingTasks: parsed.pendingTasks || {}
            };
        }
        return { 
            settings: { 
                enabled: false, 
                reminderDelay: 5, 
                customResponsibilityTime: {} 
            }, 
            activeReminders: {},
            pendingTasks: {}
        };
    } catch (error) {
        console.error('خطأ في قراءة notifications:', error);
        return { 
            settings: { 
                enabled: false, 
                reminderDelay: 5, 
                customResponsibilityTime: {} 
            }, 
            activeReminders: {},
            pendingTasks: {}
        };
    }
}

function saveNotificationsConfig(config) {
    try {
        const dataDir = path.dirname(notificationsPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        fs.writeFileSync(notificationsPath, JSON.stringify(config, null, 2));
        console.log('✅ تم حفظ إعدادات التنبيهات في JSON');
        return true;
    } catch (error) {
        console.error('خطأ في حفظ notifications:', error);
        return false;
    }
}

// متغيرات للتتبع النشط
let activeReminders = new Map();
let pendingTasks = new Map();
let reminderTimers = new Map();

// تحميل البيانات النشطة من JSON
function loadActiveData() {
    try {
        const config = loadNotificationsConfig();

        // تحميل التذكيرات النشطة
        if (config.activeReminders) {
            activeReminders.clear();
            for (const [key, value] of Object.entries(config.activeReminders)) {
                activeReminders.set(key, value);
            }
        }

        // تحميل المهام المعلقة
        if (config.pendingTasks) {
            for (const [key, value] of Object.entries(config.pendingTasks)) {
                // إعادة تشغيل التايمرات إذا لزم الأمر
                const timeElapsed = Date.now() - value.startTime;
                if (timeElapsed < value.duration) {
                    const remainingTime = value.duration - timeElapsed;
                    // يمكن إعادة تشغيل التايمر هنا
                }
            }
        }

        console.log(`✅ تم تحميل ${activeReminders.size} تذكير نشط من JSON`);
    } catch (error) {
        console.error('خطأ في تحميل البيانات النشطة:', error);
    }
}

// حفظ البيانات النشطة في JSON
function saveActiveData() {
    try {
        const config = loadNotificationsConfig();

        // تحويل Maps إلى Objects
        const activeRemindersObj = {};
        const pendingTasksObj = {};

        for (const [key, value] of activeReminders.entries()) {
            activeRemindersObj[key] = value;
        }

        for (const [key, value] of pendingTasks.entries()) {
            pendingTasksObj[key] = {
                startTime: value.startTime || Date.now(),
                duration: value.duration || 300000
            };
        }

        config.activeReminders = activeRemindersObj;
        config.pendingTasks = pendingTasksObj;

        saveNotificationsConfig(config);
    } catch (error) {
        console.error('خطأ في حفظ البيانات النشطة:', error);
    }
}

// تحميل البيانات عند بدء التشغيل
loadActiveData();

async function execute(message, args, { client, responsibilities, saveData, BOT_OWNERS }) {
    const isOwner = BOT_OWNERS.includes(message.author.id) || message.guild.ownerId === message.author.id;
    if (!isOwner) {
        await message.react('❌');
        return;
    }

    // تحميل الإعدادات من JSON
    const notificationsConfig = loadNotificationsConfig();

    const guild = message.guild;

    // إنشاء الإيمبد الديناميكي
    function createMainEmbed() {
        // Build responsibility times display
        let responsibilityTimes = '';
        if (responsibilities && Object.keys(responsibilities).length > 0) {
            for (const [respName, respData] of Object.entries(responsibilities)) {
                const customTime = notificationsConfig.settings.customResponsibilityTime?.[respName];
                const timeToShow = customTime || notificationsConfig.settings.reminderDelay;
                responsibilityTimes += `• ${respName} : ${timeToShow} دقيقة\n`;
            }
        } else {
            responsibilityTimes = 'لا توجد مسؤوليات';
        }

        return colorManager.createEmbed()
            .setTitle('Notifications sys')
            .setThumbnail('https://cdn.discordapp.com/emojis/1303973825591115846.png?v=1')
            .addFields([
                { name: '**وقت تنبيه كل المسؤوليات**', value: responsibilityTimes, inline: false },
                { name: '**التنبيه العام لكل المسؤولين**', value: `**${notificationsConfig.settings.reminderDelay} دقيقة**`, inline: true },
                { name: '**حالة النظام**', value: notificationsConfig.settings.enabled ? '**🟢 مفعل**' : '**🔴 معطل**', inline: true },
            ])
            .setFooter({ text: 'نظام إدارة التنبيهات', iconURL: guild.iconURL({ dynamic: true }) })
            .setTimestamp();
    }

    const selectOptions = [
        { label: 'my set', value: 'view_settings', description: 'عرض إعدادات أوقات التنبيه الحالية' },
        { label: 'old time', value: 'change_global_time', description: 'تعيين الوقت الافتراضي لجميع المسؤوليات' },
        { label: 'res time', value: 'set_specific_time', description: 'تعيين وقت تنبيه مخصص لمسؤولية' },
        { 
            label: notificationsConfig.settings.enabled ? 'off' : 'on', 
            value: 'toggle_system', 
            description: notificationsConfig.settings.enabled ? 'تعطيل نظام التنبيهات' : 'تفعيل نظام التنبيهات'
        }
    ];

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('notification_menu')
        .setPlaceholder('اختر خياراً...')
        .addOptions(selectOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

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
                console.log('لا يمكن تحديث رسالة التنبيهات:', error.message);
            }
        }, 1000);
    });
}

async function handleInteraction(interaction, client, responsibilities, saveData) {
    try {
        // إعادة تحميل الإعدادات عند كل تفاعل
        const notificationsConfig = loadNotificationsConfig();

        // إنشاء دالة الإيمبد الديناميكي
        function createMainEmbed() {
            const guild = interaction.guild;

            // Build responsibility times display
            let responsibilityTimes = '';
            if (responsibilities && Object.keys(responsibilities).length > 0) {
                for (const [respName, respData] of Object.entries(responsibilities)) {
                    const customTime = notificationsConfig.settings.customResponsibilityTime?.[respName];
                    const timeToShow = customTime || notificationsConfig.settings.reminderDelay;
                    responsibilityTimes += `• ${respName} : ${timeToShow} دقيقة\n`;
                }
            } else {
                responsibilityTimes = 'No res';
            }

            return colorManager.createEmbed()
                .setTitle('Notifications Sys')
                .setThumbnail('https://cdn.discordapp.com/emojis/1303973825591115846.png?v=1')
                .addFields([
                    { name: '**وقت تنبيه كل المسؤوليات**', value: responsibilityTimes, inline: false },
                    { name: '**التنبيه العام لكل المسؤولين**', value: `**${notificationsConfig.settings.reminderDelay} دقيقة**`, inline: true },
                    { name: '**حالة النظام**', value: notificationsConfig.settings.enabled ? '**🟢 مفعل**' : '**🔴 معطل**', inline: true },
                ])
                .setFooter({ text: 'نظام إدارة التنبيهات', iconURL: guild.iconURL({ dynamic: true }) })
                .setTimestamp();
        }

        const selectOptions = [
            { label: 'my set', value: 'view_settings', description: 'عرض إعدادات أوقات التنبيه الحالية' },
            { label: 'old time', value: 'change_global_time', description: 'تعيين الوقت الافتراضي لجميع المسؤوليات' },
            { label: 'res time', value: 'set_specific_time', description: 'تعيين وقت تنبيه مخصص لمسؤولية' },
            { 
                label: notificationsConfig.settings.enabled ? 'off' : 'Noti', 
                value: 'toggle_system', 
                description: notificationsConfig.settings.enabled ? 'تعطيل نظام التنبيهات' : 'تفعيل نظام التنبيهات'
            }
        ];

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('notification_menu')
            .setPlaceholder('اختر خياراً...')
            .addOptions(selectOptions);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        if (interaction.customId === 'notification_menu') {
            const selectedValue = interaction.values[0];

            if (selectedValue === 'toggle_system') {
                await interaction.deferUpdate();

                const config = loadNotificationsConfig();
                config.settings.enabled = !config.settings.enabled;
                saveNotificationsConfig(config);

                // تحديث فوري للرسالة الأساسية
                await updateNotificationMessage(interaction, config);

                const status = config.settings.enabled ? 'مفعل' : 'معطل';
                await interaction.followUp({ 
                    content: `✅ **تم ${config.settings.enabled ? 'تفعيل' : 'تعطيل'} نظام التنبيهات!**\nالحالة الحالية: **${status}**`, 
                    ephemeral: true 
                });

            } else if (selectedValue === 'change_global_time') {
                const modal = new ModalBuilder()
                    .setCustomId('change_global_time_modal')
                    .setTitle('تغيير الوقت العام للتنبيه');

                const timeInput = new TextInputBuilder()
                    .setCustomId('global_time')
                    .setLabel('الوقت بالدقائق')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setValue(String(notificationsConfig.settings.reminderDelay))
                    .setPlaceholder('مثال: 5');

                const actionRow = new ActionRowBuilder().addComponents(timeInput);
                modal.addComponents(actionRow);

                await interaction.showModal(modal);

            } else if (selectedValue === 'set_specific_time') {
                if (!responsibilities || Object.keys(responsibilities).length === 0) {
                    return interaction.reply({ 
                        content: '❌ **لا توجد مسؤوليات متاحة!**', 
                        ephemeral: true 
                    });
                }

                const options = Object.keys(responsibilities).map(resp => ({
                    label: resp,
                    description: `تعيين وقت التنبيه لـ ${resp}`,
                    value: resp
                }));

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('select_responsibility_time')
                    .setPlaceholder('اختر المسؤولية')
                    .addOptions(options);

                const row = new ActionRowBuilder().addComponents(selectMenu);

                await interaction.reply({
                    content: '**اختر المسؤولية لتعيين وقت تنبيه لها:**',
                    components: [row],
                    ephemeral: true
                });

            } else if (selectedValue === 'toggle_system') {
                const notificationsConfig = loadNotificationsConfig();
                const newStatus = !notificationsConfig.settings.enabled;
                notificationsConfig.settings.enabled = newStatus;
                saveNotificationsConfig(notificationsConfig);

                const toggleEmbed = colorManager.createEmbed()
                    .setDescription(newStatus ? '✅ **Notifications on**' : '❌ **Notifications off**')
                    .setColor(colorManager.getColor())
                    .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400659658573611170/download__9_-removebg-preview.png?ex=688d7175&is=688c1ff5&hm=f4a370397c3e01defe0563ceda56b2415af211f7a80bbe8b053aaf601538d5a6&');

                await interaction.reply({ embeds: [toggleEmbed], ephemeral: true });

                // تحديث الرسالة الأساسية والمنيو فوراً
                setTimeout(async () => {
                    try {
                        const updatedConfig = loadNotificationsConfig();

                        // إنشاء المنيو المحدث
                        const updatedSelectOptions = [
                            { label: 'my set', value: 'view_settings', description: 'عرض إعدادات أوقات التنبيه الحالية' },
                            { label: 'old time', value: 'change_global_time', description: 'تعيين الوقت الافتراضي لجميع المسؤوليات' },
                            { label: 'res time', value: 'set_specific_time', description: 'تعيين وقت تنبيه مخصص لمسؤولية' },
                            { 
                                label: updatedConfig.settings.enabled ? 'off' : 'on', 
                                value: 'toggle_system', 
                                description: updatedConfig.settings.enabled ? 'تعطيل نظام التنبيهات' : 'تفعيل نظام التنبيهات'
                            }
                        ];

                        const updatedSelectMenu = new StringSelectMenuBuilder()
                            .setCustomId('notification_menu')
                            .setPlaceholder('اختر خياراً...')
                            .addOptions(updatedSelectOptions);

                        const updatedRow = new ActionRowBuilder().addComponents(updatedSelectMenu);

                        await interaction.message.edit({ embeds: [createMainEmbed()], components: [updatedRow] });
                        await interaction.message.react(newStatus ? '✅' : '❌');
                    } catch (error) {
                        console.log('لا يمكن تحديث الرسالة:', error.message);
                    }
                }, 500);
            }

        } else if (interaction.customId === 'select_responsibility_time') {
            const selectedResp = interaction.values[0];
            const notificationsConfig = loadNotificationsConfig();
            const currentTime = notificationsConfig.settings.customResponsibilityTime?.[selectedResp] || notificationsConfig.settings.reminderDelay;

            const modal = new ModalBuilder()
                .setCustomId(`responsibility_time_modal_${selectedResp}`)
                .setTitle(`تعيين وقت لـ ${selectedResp}`);

            const timeInput = new TextInputBuilder()
                .setCustomId('custom_time')
                .setLabel('الوقت بالدقائق')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(currentTime))
                .setPlaceholder('مثال: 10');

            const actionRow = new ActionRowBuilder().addComponents(timeInput);
            modal.addComponents(actionRow);

            await interaction.showModal(modal);
        }

    } catch (error) {
        console.error('Error in notifications interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
                content: '❌ حدث خطأ أثناء معالجة طلبك!', 
                ephemeral: true 
            });
        }
    }
}

async function handleModalSubmit(interaction, client, responsibilities) {
    try {
        // إعادة تحميل الإعدادات
        const notificationsConfig = loadNotificationsConfig();

        if (interaction.customId === 'change_global_time_modal') {
            const timeValue = interaction.fields.getTextInputValue('global_time');
            const time = parseInt(timeValue);

            if (isNaN(time) || time < 1) {
                return interaction.reply({ 
                    content: '❌ **يرجى إدخال رقم صحيح أكبر من 0 !**', 
                    ephemeral: true 
                });
            }

            notificationsConfig.settings.reminderDelay = time;
            saveNotificationsConfig(notificationsConfig);

            await interaction.reply({ 
                content: `✅ **تم تعيين الوقت العام للتنبيه إلى __${time}__ دقيقة!**`, 
                ephemeral: true 
            });

            // تحديث فوري للرسالة الأساسية
            setTimeout(async () => {
                try {
                    // البحث عن الرسالة الأساسية لـ notifications
                    const messages = await interaction.channel.messages.fetch({ limit: 10 });
                    const notificationsMessage = messages.find(msg => 
                        msg.author.id === interaction.client.user.id && 
                        msg.embeds.length > 0 && 
                        msg.embeds[0].title?.includes('Notifications')
                    );

                    if (notificationsMessage) {
                        // إعادة تحميل الإعدادات المحدثة
                        const updatedConfig = loadNotificationsConfig();

                        // جلب المسؤوليات من الملف
                        const fs = require('fs');
                        const path = require('path');
                        const responsibilitiesPath = path.join(__dirname, '..', 'data', 'responsibilities.json');
                        let responsibilities = {};

                        try {
                            if (fs.existsSync(responsibilitiesPath)) {
                                const data = fs.readFileSync(responsibilitiesPath, 'utf8');
                                responsibilities = JSON.parse(data);
                            }
                        } catch (error) {
                            console.log('خطأ في قراءة المسؤوليات:', error);
                        }

                        let responsibilityTimes = '';
                        if (responsibilities && Object.keys(responsibilities).length > 0) {
                            for (const [respName, respData] of Object.entries(responsibilities)) {
                                const customTime = updatedConfig.settings.customResponsibilityTime?.[respName];
                                const timeToShow = customTime || updatedConfig.settings.reminderDelay;
                                responsibilityTimes += `• ${respName} : ${timeToShow} دقيقة\n`;
                            }
                        } else {
                            responsibilityTimes = 'لا توجد مسؤوليات';
                        }

                        const updatedEmbed = colorManager.createEmbed()
                            .setTitle('Notifications sys')
                            .setColor(colorManager.getColor())
                            .setThumbnail('https://cdn.discordapp.com/emojis/1303973825591115846.png?v=1')
                            .addFields([
                                { name: '**وقت تنبيه كل المسؤوليات**', value: responsibilityTimes, inline: false },
                                { name: '**التنبيه العام لكل المسؤولين**', value: `**${updatedConfig.settings.reminderDelay} دقيقة**`, inline: true },
                                { name: '**حالة النظام**', value: updatedConfig.settings.enabled ? '**🟢 مفعل**' : '**🔴 معطل**', inline: true },
                            ])
                            .setFooter({ text: 'نظام إدارة التنبيهات', iconURL: interaction.guild.iconURL({ dynamic: true }) })
                            .setTimestamp();

                        const selectOptions = [
                            { label: 'my set', value: 'view_settings', description: 'عرض إعدادات أوقات التنبيه الحالية' },
                            { label: 'old time', value: 'change_global_time', description: 'تعيين الوقت الافتراضي لجميع المسؤوليات' },
                            { label: 'res time', value: 'set_specific_time', description: 'تعيين وقت تنبيه مخصص لمسؤولية' },
                            { 
                                label: updatedConfig.settings.enabled ? 'off' : 'on', 
                                value: 'toggle_system', 
                                description: updatedConfig.settings.enabled ? 'تعطيل نظام التنبيهات' : 'تفعيل نظام التنبيهات'
                            }
                        ];

                        const selectMenu = new StringSelectMenuBuilder()
                            .setCustomId('notification_menu')
                            .setPlaceholder('اختر خياراً...')
                            .addOptions(selectOptions);

                        const updatedRow = new ActionRowBuilder().addComponents(selectMenu);

                        await notificationsMessage.edit({ embeds: [updatedEmbed], components: [updatedRow] });
                    }
                } catch (error) {
                    console.log('لا يمكن تحديث الرسالة الأساسية:', error.message);
                }
            }, 200);

        } else if (interaction.customId.startsWith('responsibility_time_modal_')) {
            const responsibilityName = interaction.customId.replace('responsibility_time_modal_', '');
            const timeValue = interaction.fields.getTextInputValue('custom_time');
            const time = parseInt(timeValue);

            if (isNaN(time) || time < 1) {
                return interaction.reply({ 
                    content: '❌ **يرجى إدخال رقم صحيح أكبر من 0!**', 
                    ephemeral: true 
                });
            }

            if (!notificationsConfig.settings.customResponsibilityTime) {
                notificationsConfig.settings.customResponsibilityTime = {};
            }

            notificationsConfig.settings.customResponsibilityTime[responsibilityName] = time;
            saveNotificationsConfig(notificationsConfig);

            await interaction.reply({ 
                content: `✅ **تم تعيين وقت التنبيه لـ "__${responsibilityName}__" إلى ${time} دقيقة!**`, 
                ephemeral: true 
            });

            // تحديث الرسالة الأساسية
            setTimeout(async () => {
                try {
                    // البحث عن الرسالة الأساسية لـ notifications
                    const messages = await interaction.channel.messages.fetch({ limit: 10 });
                    const notificationsMessage = messages.find(msg => 
                        msg.author.id === interaction.client.user.id && 
                        msg.embeds.length > 0 && 
                        msg.embeds[0].title?.includes('Notifications')
                    );

                    if (notificationsMessage) {
                        // إعادة تحميل الإعدادات المحدثة
                        const updatedConfig = loadNotificationsConfig();

                        // جلب المسؤوليات من الملف
                        const fs = require('fs');
                        const path = require('path');
                        const responsibilitiesPath = path.join(__dirname, '..', 'data', 'responsibilities.json');
                        let responsibilities = {};

                        try {
                            if (fs.existsSync(responsibilitiesPath)) {
                                const data = fs.readFileSync(responsibilitiesPath, 'utf8');
                                responsibilities = JSON.parse(data);
                            }
                        } catch (error) {
                            console.log('خطأ في قراءة المسؤوليات:', error);
                        }

                        let responsibilityTimes = '';
                        if (responsibilities && Object.keys(responsibilities).length > 0) {
                            for (const [respName, respData] of Object.entries(responsibilities)) {
                                const customTime = updatedConfig.settings.customResponsibilityTime?.[respName];
                                const timeToShow = customTime || updatedConfig.settings.reminderDelay;
                                responsibilityTimes += `• ${respName} : ${timeToShow} دقيقة\n`;
                            }
                        } else {
                            responsibilityTimes = 'لا توجد مسؤوليات';
                        }

                        const updatedEmbed = colorManager.createEmbed()
                            .setTitle('Notifications sys')
                            .setColor(colorManager.getColor())
                            .setThumbnail('https://cdn.discordapp.com/emojis/1303973825591115846.png?v=1')
                            .addFields([
                                { name: '**وقت تنبيه كل المسؤوليات**', value: responsibilityTimes, inline: false },
                                { name: '**التنبيه العام لكل المسؤولين**', value: `**${updatedConfig.settings.reminderDelay} دقيقة**`, inline: true },
                                { name: '**حالة النظام**', value: updatedConfig.settings.enabled ? '**🟢 مفعل**' : '**🔴 معطل**', inline: true },
                            ])
                            .setFooter({ text: 'نظام إدارة التنبيهات', iconURL: interaction.guild.iconURL({ dynamic: true }) })
                            .setTimestamp();

                        const selectOptions = [
                            { label: 'my set', value: 'view_settings', description: 'عرض إعدادات أوقات التنبيه الحالية' },
                            { label: 'old time', value: 'change_global_time', description: 'تعيين الوقت الافتراضي لجميع المسؤوليات' },
                            { label: 'res time', value: 'set_specific_time', description: 'تعيين وقت تنبيه مخصص لمسؤولية' },
                            { 
                                label: updatedConfig.settings.enabled ? 'off' : 'on', 
                                value: 'toggle_system', 
                                description: updatedConfig.settings.enabled ? 'تعطيل نظام التنبيهات' : 'تفعيل نظام التنبيهات'
                            }
                        ];

                        const selectMenu = new StringSelectMenuBuilder()
                            .setCustomId('notification_menu')
                            .setPlaceholder('اختر خياراً...')
                            .addOptions(selectOptions);

                        const updatedRow = new ActionRowBuilder().addComponents(selectMenu);

                        await notificationsMessage.edit({ embeds: [updatedEmbed], components: [updatedRow] });
                    }
                } catch (error) {
                    console.log('لا يمكن تحديث الرسالة الأساسية:', error.message);
                }
            }, 200);
        }

    } catch (error) {
        console.error('Error in notifications modal submit:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
                content: '❌ حدث خطأ أثناء حفظ الإعدادات!', 
                ephemeral: true 
            });
        }
    }
}

// Function to track task and set reminder
async function trackTask(taskId, responsibilityName, responsibles, client) {
    // تحميل الإعدادات من JSON
    const notificationsConfig = loadNotificationsConfig();

    if (!notificationsConfig.settings.enabled) return;

    const reminderTime = notificationsConfig.settings.customResponsibilityTime[responsibilityName] || notificationsConfig.settings.reminderDelay;
    const timeoutMs = reminderTime * 60 * 1000; // Convert to milliseconds

    // حفظ معلومات المهمة النشطة
    activeReminders.set(taskId, {
        responsibilityName,
        responsibles,
        startTime: Date.now(),
        reminderTime
    });

    const timeout = setTimeout(async () => {
        // Check if task is still unclaimed
        if (client.activeTasks && client.activeTasks.has(taskId)) {
            // Task is still active (unclaimed), send reminders
            for (const userId of responsibles) {
                try {
                    const user = await client.users.fetch(userId);
                    const currentTime = new Date().toLocaleString('en-US', {
                        timeZone: 'Asia/Riyadh',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true
                    });

                    const reminderEmbed = colorManager.createEmbed()
                        .setTitle('Task Reminder')
                        .setDescription(`There's someone who needs you for the responsibility: **${responsibilityName}**`)
                        .addFields([
                            { name: 'Responsibility', value: responsibilityName, inline: true },
                            { name: 'Time', value: currentTime, inline: true }
                        ])
                        .setColor(colorManager.getColor())
                        .setTimestamp();

                    await user.send({ embeds: [reminderEmbed] });
                } catch (error) {
                    console.error(`Failed to send reminder to user ${userId}:`, error.message);
                }
            }

            // Log the reminder event
            const guild = client.guilds.cache.first();
            if (guild) {
                logEvent(client, guild, {
                    type: 'NOTIFICATION_SYSTEM',
                    title: 'Task Not Claimed',
                    description: `Task for responsibility **${responsibilityName}** was not claimed for ${reminderTime} minutes`,
                    user: client.user,
                    fields: [
                        { name: 'Responsibility', value: responsibilityName, inline: true },
                        { name: 'Duration', value: `${reminderTime} minutes`, inline: true },
                        { name: 'Responsibles Count', value: responsibles.length.toString(), inline: true }
                    ]
                });
            }
        }

        // Clean up
        pendingTasks.delete(taskId);
        activeReminders.delete(taskId);
        reminderTimers.delete(taskId);

        // حفظ التغييرات
        saveActiveData();
    }, timeoutMs);

    pendingTasks.set(taskId, timeout);
    reminderTimers.set(taskId, {
        startTime: Date.now(),
        duration: timeoutMs
    });

    // حفظ البيانات النشطة
    saveActiveData();
}

// Function to cancel tracking when task is claimed
function cancelTaskTracking(taskId) {
    if (pendingTasks.has(taskId)) {
        clearTimeout(pendingTasks.get(taskId));
        pendingTasks.delete(taskId);
        activeReminders.delete(taskId);
        reminderTimers.delete(taskId);
        saveActiveData();
    }
}

async function updateNotificationMessage(interaction, config) {
    try {
        // جلب المسؤوليات من الملف
        const fs = require('fs');
        const path = require('path');
        const responsibilitiesPath = path.join(__dirname, '..', 'data', 'responsibilities.json');
        let responsibilities = {};

        try {
            if (fs.existsSync(responsibilitiesPath)) {
                const data = fs.readFileSync(responsibilitiesPath, 'utf8');
                responsibilities = JSON.parse(data);
            }
        } catch (error) {
            console.log('خطأ في قراءة المسؤوليات:', error);
        }

        let responsibilityTimes = '';
        if (responsibilities && Object.keys(responsibilities).length > 0) {
            for (const [respName, respData] of Object.entries(responsibilities)) {
                const customTime = config.settings.customResponsibilityTime?.[respName];
                const timeToShow = customTime || config.settings.reminderDelay;
                responsibilityTimes += `• ${respName} : ${timeToShow} دقيقة\n`;
            }
        } else {
            responsibilityTimes = 'لا توجد مسؤوليات';
        }

        const updatedEmbed = colorManager.createEmbed()
            .setTitle('Notifications sys')
            .setColor(colorManager.getColor())
            .setThumbnail('https://cdn.discordapp.com/emojis/1303973825591115846.png?v=1')
            .addFields([
                { name: '**وقت تنبيه كل المسؤوليات**', value: responsibilityTimes, inline: false },
                { name: '**التنبيه العام لكل المسؤولين**', value: `**${config.settings.reminderDelay} دقيقة**`, inline: true },
                { name: '**حالة النظام**', value: config.settings.enabled ? '**🟢 مفعل**' : '**🔴 معطل**', inline: true },
            ])
            .setFooter({ text: 'نظام إدارة التنبيهات', iconURL: interaction.guild.iconURL({ dynamic: true }) })
            .setTimestamp();

        const selectOptions = [
            { label: 'my set', value: 'view_settings', description: 'عرض إعدادات أوقات التنبيه الحالية' },
            { label: 'old time', value: 'change_global_time', description: 'تعيين الوقت الافتراضي لجميع المسؤوليات' },
            { label: 'res time', value: 'set_specific_time', description: 'تعيين وقت تنبيه مخصص لمسؤولية' },
            { 
                label: config.settings.enabled ? 'off' : 'on', 
                value: 'toggle_system', 
                description: config.settings.enabled ? 'تعطيل نظام التنبيهات' : 'تفعيل نظام التنبيهات'
            }
        ];

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('notification_menu')
            .setPlaceholder('اختر خياراً...')
            .addOptions(selectOptions);

        const updatedRow = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.message.edit({ embeds: [updatedEmbed], components: [updatedRow] });
    } catch (error) {
        console.log('لا يمكن تحديث الرسالة الأساسية:', error.message);
    }
}

module.exports = { 
    name, 
    execute, 
    handleInteraction,
    handleModalSubmit,
    trackTask,
    cancelTaskTracking,
    loadNotificationsConfig,
    saveNotificationsConfig
};