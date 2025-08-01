const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const colorManager = require('../colorManager');
const { logEvent } = require('../logs_system');
const fs = require('fs');
const path = require('path');

const name = 'reset';

// مسارات الملفات
const pointsPath = path.join(__dirname, '..', 'data', 'points.json');
const responsibilitiesPath = path.join(__dirname, '..', 'data', 'responsibilities.json');

// دوال قراءة وحفظ البيانات
function readJSONFile(filePath, defaultValue = {}) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
        return defaultValue;
    } catch (error) {
        console.error(`خطأ في قراءة ${filePath}:`, error);
        return defaultValue;
    }
}

function writeJSONFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error(`خطأ في كتابة ${filePath}:`, error);
        return false;
    }
}

async function execute(message, args, { points, responsibilities, saveData, BOT_OWNERS, client }) {
    if (!BOT_OWNERS.includes(message.author.id) && message.guild.ownerId !== message.author.id) {
        await message.react('❌');
        return;
    }

    // قراءة البيانات المحدثة من الملفات
    const currentPoints = readJSONFile(pointsPath, {});
    const currentResponsibilities = readJSONFile(responsibilitiesPath, {});

    // معالجة الأرغيومنتات المباشرة
    if (args.length > 0) {
        await handleDirectReset(message, args, currentPoints, currentResponsibilities, saveData, client);
        return;
    }

    // عرض المنيو الرئيسي
    await showMainResetMenu(message, currentPoints, currentResponsibilities, saveData, client);
}

async function showMainResetMenu(message, points, responsibilities, saveData, client) {
    const embed = createMainEmbed(points, responsibilities);
    const components = createMainComponents();

    const sentMessage = await message.channel.send({ 
        embeds: [embed], 
        components: components
    });

    const filter = i => i.user.id === message.author.id;
    const collector = sentMessage.createMessageComponentCollector({ filter, time: 600000 });

    collector.on('collect', async interaction => {
        try {
            await handleMainInteraction(interaction, points, responsibilities, saveData, client, collector);
        } catch (error) {
            console.error('خطأ في معالج الريست:', error);
            await handleInteractionError(interaction, error);
        }
    });

    collector.on('end', () => {
        disableComponents(sentMessage, components);
    });
}

async function handleMainInteraction(interaction, points, responsibilities, saveData, client, mainCollector) {
    const { customId } = interaction;

    // التحقق من صحة التفاعل
    if (!interaction || !interaction.isRepliable()) {
        console.log('تفاعل غير صالح في reset');
        return;
    }

    // منع التفاعلات المتكررة
    if (interaction.replied || interaction.deferred) {
        console.log('تم تجاهل تفاعل متكرر في reset');
        return;
    }

    // قراءة البيانات المحدثة مع معالجة الأخطاء
    let currentPoints, currentResponsibilities;
    try {
        currentPoints = readJSONFile(pointsPath, {});
        currentResponsibilities = readJSONFile(responsibilitiesPath, {});
    } catch (error) {
        console.error('خطأ في قراءة البيانات:', error);
        await safeReply(interaction, '**❌ حدث خطأ في قراءة البيانات**');
        return;
    }

    if (customId === 'reset_cancel') {
        await interaction.update({
            content: '**❌ تم إلغاء عملية التصفير**',
            embeds: [],
            components: []
        });
        mainCollector.stop();
        return;
    }

    if (customId === 'reset_refresh') {
        const embed = createMainEmbed(currentPoints, currentResponsibilities);
        const components = createMainComponents();
        await interaction.update({ embeds: [embed], components: components });
        return;
    }

    if (customId === 'back_to_main_reset') {
        const embed = createMainEmbed(currentPoints, currentResponsibilities);
        const components = createMainComponents();
        await interaction.update({ embeds: [embed], components: components });
        return;
    }

    if (interaction.isStringSelectMenu() && customId === 'reset_type_select') {
        const resetType = interaction.values[0];

        switch (resetType) {
            case 'daily':
            case 'weekly':
            case 'monthly':
            case 'all_points':
                await handleTimeBasedReset(interaction, resetType, currentPoints, currentResponsibilities, client);
                break;
            case 'responsibility':
                await handleResponsibilityReset(interaction, currentPoints, currentResponsibilities, client);
                break;
            case 'user':
                await handleUserReset(interaction, currentPoints, currentResponsibilities, client);
                break;
            case 'manage_points':
                await handleManagePoints(interaction, currentPoints, currentResponsibilities, client);
                break;
            case 'responsibilities':
                await handleResponsibilitiesReset(interaction, currentPoints, currentResponsibilities, client);
                break;
        }
    }
}

async function handleTimeBasedReset(interaction, resetType, points, responsibilities, client) {
    const affectedPoints = calculateAffectedPoints(points, resetType);

    const confirmEmbed = colorManager.createEmbed()
        .setTitle(`**Sure ${getResetTypeName(resetType)}**`)
        .setDescription(`** هل انت متاكد من التصفير${getResetTypeName(resetType).toLowerCase()}؟**`)
        .setColor('#ff9500')
        .addFields([
            { name: '** Type **', value: getResetTypeDescription(resetType), inline: false },
            { name: '**Points**', value: `${affectedPoints} نقطة`, inline: false }
        ])
        .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400670548463456306/9908185.png?ex=688d7b99&is=688c2a19&hm=92e3397be8a05852507afb7133dccd47a7c4c2ebca8dbdc26911e65414545ae9&');

    const confirmButtons = new ActionRowBuilder().addComponents([
        new ButtonBuilder()
            .setCustomId(`confirm_time_reset_${resetType}`)
            .setLabel('Delete')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('back_to_main_reset')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
    ]);

    await interaction.update({ embeds: [confirmEmbed], components: [confirmButtons] });

    const confirmFilter = i => i.user.id === interaction.user.id;
    const confirmCollector = interaction.message.createMessageComponentCollector({ 
        filter: confirmFilter, 
        time: 90000 
    });

    confirmCollector.on('collect', async confirmInt => {
        try {
            if (confirmInt.customId === 'back_to_main_reset') {
                const currentPoints = readJSONFile(pointsPath, {});
                const currentResponsibilities = readJSONFile(responsibilitiesPath, {});
                const embed = createMainEmbed(currentPoints, currentResponsibilities);
                const components = createMainComponents();
                await confirmInt.update({ embeds: [embed], components: components });
                return;
            }

            if (confirmInt.customId === `confirm_time_reset_${resetType}`) {
                await confirmInt.deferUpdate();

                // تنفيذ التصفير
                const result = await performTimeBasedReset(resetType, points);

                // حفظ البيانات في الملفات
                const saveSuccess = writeJSONFile(pointsPath, points);

                if (!saveSuccess) {
                    throw new Error('فشل في حفظ البيانات');
                }

                const resultEmbed = colorManager.createEmbed()
                    .setTitle('**✅ تم التصفير بنجاح**')
                    .setColor('#00ff00')
                    .addFields([
                        { name: '**Type**', value: getResetTypeName(resetType), inline: true },
                        { name: '**Points**', value: `${result.deletedPoints}`, inline: true },
                        { name: '**Resb effective**', value: `${result.affectedUsers}`, inline: true }
                    ])
                    .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400672460558303252/images__10_-removebg-preview.png?ex=688d7d61&is=688c2be1&hm=d98e0873eeb313e329ff2c665c3e7a29e117a16f85e77e5815b78369615850aa&')
                    .setTimestamp();

                const backButton = new ActionRowBuilder().addComponents([
                    new ButtonBuilder()
                        .setCustomId('back_to_main_reset')
                        .setLabel('Main menu')
                        .setStyle(ButtonStyle.Primary)
                ]);

                await confirmInt.editReply({ embeds: [resultEmbed], components: [backButton] });

                // تسجيل العملية
                logEvent(client, interaction.guild, {
                    type: 'POINT_SYSTEM',
                    title: `تم ${getResetTypeName(resetType)}`,
                    description: `النقاط المحذوفة: ${result.deletedPoints}\nالمسؤولين المتأثرين: ${result.affectedUsers}`,
                    user: interaction.user,
                    fields: [
                        { name: 'نوع التصفير', value: getResetTypeDescription(resetType), inline: true }
                    ]
                });
            }
        } catch (error) {
            console.error('خطأ في تأكيد التصفير الزمني:', error);
            await handleInteractionError(confirmInt, error);
        }
    });

    confirmCollector.on('end', () => {
        if (!confirmCollector.ended) {
            const disabledButtons = new ActionRowBuilder().addComponents(
                confirmButtons.components.map(btn => ButtonBuilder.from(btn).setDisabled(true))
            );
            interaction.editReply({ components: [disabledButtons] }).catch(() => {});
        }
    });
}

async function handleResponsibilityReset(interaction, points, responsibilities, client) {
    const respOptions = Object.keys(responsibilities).slice(0, 25).map(resp => ({
        label: resp,
        value: resp,
        description: `${Object.keys(responsibilities[resp].responsibles || {}).length} مسؤولين - ${calculateResponsibilityPoints(points, resp)} نقطة`
    }));

    if (respOptions.length === 0) {
        const embed = createMainEmbed(points, responsibilities);
        const components = createMainComponents();
        await interaction.update({
            content: '**❌ لا توجد مسؤوليات لتصفيرها**',
            embeds: [embed],
            components: components
        });
        return;
    }

    const respEmbed = colorManager.createEmbed()
        .setTitle('**اختيار المسؤولية**')
        .setDescription('**اختر المسؤولية التي تريد تصفير نقاطها:**')
        .setColor('#4ecdc4')
        .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400670548463456306/9908185.png?ex=688d7b99&is=688c2a19&hm=92e3397be8a05852507afb7133dccd47a7c4c2ebca8dbdc26911e65414545ae9&');

    const respSelect = new StringSelectMenuBuilder()
        .setCustomId('select_responsibility_reset')
        .setPlaceholder('اختر المسؤولية...')
        .addOptions(respOptions);

    const components = [
        new ActionRowBuilder().addComponents(respSelect),
        new ActionRowBuilder().addComponents([
            new ButtonBuilder()
                .setCustomId('back_to_main_reset')
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
        ])
    ];

    await interaction.update({ embeds: [respEmbed], components: components });

    const respFilter = i => i.user.id === interaction.user.id;
    const respCollector = interaction.message.createMessageComponentCollector({ 
        filter: respFilter, 
        time: 300000 
    });

    respCollector.on('collect', async respInt => {
        try {
            if (respInt.customId === 'back_to_main_reset') {
                const currentPoints = readJSONFile(pointsPath, {});
                const currentResponsibilities = readJSONFile(responsibilitiesPath, {});
                const embed = createMainEmbed(currentPoints, currentResponsibilities);
                const components = createMainComponents();
                await respInt.update({ embeds: [embed], components: components });
                return;
            }

            if (respInt.customId === 'select_responsibility_reset') {
                const selectedResp = respInt.values[0];
                await handleResponsibilityConfirmation(respInt, selectedResp, points, responsibilities, client);
            }

            if (respInt.customId.startsWith('confirm_resp_reset_')) {
                const respName = respInt.customId.replace('confirm_resp_reset_', '');
                await executeResponsibilityReset(respInt, respName, points, responsibilities, client);
            }
        } catch (error) {
            console.error('خطأ في معالج المسؤوليات:', error);
            await handleInteractionError(respInt, error);
        }
    });
}

async function handleResponsibilityConfirmation(interaction, respName, points, responsibilities, client) {
    const respPoints = calculateResponsibilityPoints(points, respName);

    const confirmEmbed = colorManager.createEmbed()
        .setTitle('**Reset points**')
        .setDescription(`**هل أنت متأكد من تصفير نقاط مسؤولية "${respName}"؟**`)
        .setColor('#ff9500')
        .addFields([
            { name: '** Deleting**', value: `${respPoints} نقطة`, inline: true }
        ])
        .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400670784019628163/download__11_-removebg-preview.png?ex=688d7bd2&is=688c2a52&hm=40d42fba69b5b3423b7821140751dbff0e640e95f1ffc9f65b44a038fe0c5764&');

    const confirmButtons = new ActionRowBuilder().addComponents([
        new ButtonBuilder()
            .setCustomId(`confirm_resp_reset_${respName}`)
            .setLabel('Ok')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('back_to_main_reset')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
    ]);

    await interaction.update({ embeds: [confirmEmbed], components: [confirmButtons] });
}

async function executeResponsibilityReset(interaction, respName, points, responsibilities, client) {
    await interaction.deferUpdate();

    try {
        const deletedPoints = calculateResponsibilityPoints(points, respName);

        // حذف النقاط
        if (points[respName]) {
            points[respName] = {};
        }

        // حفظ البيانات
        const saveSuccess = writeJSONFile(pointsPath, points);

        if (!saveSuccess) {
            throw new Error('فشل في حفظ البيانات');
        }

        const resultEmbed = colorManager.createEmbed()
            .setTitle('**✅ Reseted**')
            .setDescription(`**تم تصفير مسؤولية "${respName}" بنجاح**`)
            .setColor('#00ff00')
            .addFields([
                { name: '**Deleted**', value: `${deletedPoints}`, inline: true }
            ])
            .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400672460558303252/images__10_-removebg-preview.png?ex=688d7d61&is=688c2be1&hm=d98e0873eeb313e329ff2c665c3e7a29e117a16f85e77e5815b78369615850aa&')
            .setTimestamp();

        const backButton = new ActionRowBuilder().addComponents([
            new ButtonBuilder()
                .setCustomId('back_to_main_reset')
                .setLabel('Back')
                .setStyle(ButtonStyle.Primary)
        ]);

        await interaction.editReply({ embeds: [resultEmbed], components: [backButton] });

        // تسجيل العملية
        logEvent(client, interaction.guild, {
            type: 'POINT_SYSTEM',
            title: 'تصفير مسؤولية',
            description: `تم تصفير مسؤولية ${respName} - ${deletedPoints} نقطة`,
            user: interaction.user
        });
    } catch (error) {
        console.error('خطأ في تصفير المسؤولية:', error);
        throw error;
    }
}

async function handleUserReset(interaction, points, responsibilities, client) {
    // أولاً نعرض المسؤوليات للاختيار منها
    const respOptions = Object.keys(responsibilities).slice(0, 24).map(resp => ({
        label: resp,
        value: resp,
        description: `${Object.keys(responsibilities[resp].responsibles || {}).length} مسؤولين - ${calculateResponsibilityPoints(points, resp)} نقطة`
    }));

    // إضافة خيار "جميع المسؤوليات"
    respOptions.unshift({
        label: 'All Responsibilities',
        value: 'all_responsibilities',
        description: 'عرض جميع المسؤولين من كل المسؤوليات'
    });

    if (respOptions.length === 1) { // فقط خيار "الكل"
        const embed = createMainEmbed(points, responsibilities);
        const components = createMainComponents();
        await interaction.update({
            content: '**❌ لا توجد مسؤوليات تحتوي على مسؤولين**',
            embeds: [embed],
            components: components
        });
        return;
    }

    const respEmbed = colorManager.createEmbed()
        .setTitle('**Choose Responsibility**')
        .setDescription('**اختر المسؤولية التي تريد تصفير نقاط مسؤوليها:**')
        .setColor('#4ecdc4')
        .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400670548463456306/9908185.png?ex=688d7b99&is=688c2a19&hm=92e3397be8a05852507afb7133dccd47a7c4c2ebca8dbdc26911e65414545ae9&');

    const respSelect = new StringSelectMenuBuilder()
        .setCustomId('select_responsibility_for_user_reset')
        .setPlaceholder('اختر المسؤولية...')
        .addOptions(respOptions);

    const components = [
        new ActionRowBuilder().addComponents(respSelect),
        new ActionRowBuilder().addComponents([
            new ButtonBuilder()
                .setCustomId('back_to_main_reset')
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
        ])
    ];

    await interaction.update({ embeds: [respEmbed], components: components });

    const respFilter = i => i.user.id === interaction.user.id;
    const respCollector = interaction.message.createMessageComponentCollector({ 
        filter: respFilter, 
        time: 300000 
    });

    respCollector.on('collect', async respInt => {
        try {
            if (respInt.customId === 'back_to_main_reset') {
                const currentPoints = readJSONFile(pointsPath, {});
                const currentResponsibilities = readJSONFile(responsibilitiesPath, {});
                const embed = createMainEmbed(currentPoints, currentResponsibilities);
                const components = createMainComponents();
                await respInt.update({ embeds: [embed], components: components });
                return;
            }

            if (respInt.customId === 'select_responsibility_for_user_reset') {
                const selectedResp = respInt.values[0];
                await showUsersForReset(respInt, selectedResp, points, responsibilities, client);
            }
        } catch (error) {
            console.error('خطأ في اختيار المسؤولية للتصفير:', error);
            await handleInteractionError(respInt, error);
        }
    });
}

async function showUsersForReset(interaction, selectedResp, points, responsibilities, client) {
    let allUsers;

    if (selectedResp === 'all_responsibilities') {
        allUsers = getAllUsersWithPoints(points, responsibilities);
    } else {
        allUsers = getUsersFromResponsibility(points, responsibilities, selectedResp);
    }

    if (allUsers.length === 0) {
        const embed = createMainEmbed(points, responsibilities);
        const components = createMainComponents();
        await interaction.update({
            content: '**❌ لا يوجد مسؤولين لديهم نقاط في هذه المسؤولية**',
            embeds: [embed],
            components: components
        });
        return;
    }

    // جلب النكنيم لكل مستخدم
    const userOptionsWithNicknames = [];
    for (const user of allUsers.slice(0, 25)) {
        try {
            const member = await interaction.guild.members.fetch(user.id);
            const displayName = member.displayName || member.user.username;
            userOptionsWithNicknames.push({
                label: displayName,
                value: user.id,
                description: `${user.totalPoints} نقطة في ${user.responsibilities} مسؤولية`
            });
        } catch (error) {
            userOptionsWithNicknames.push({
                label: `مستخدم ${user.id.slice(-4)}`,
                value: user.id,
                description: `${user.totalPoints} نقطة في ${user.responsibilities} مسؤولية`
            });
        }
    }

    const userEmbed = colorManager.createEmbed()
        .setTitle('**Choose Member**')
        .setDescription('**اختر المسؤول الذي تريد تصفير نقاطه:**')
        .setColor('#ff6b9d')
        .setThumbnail('https://cdn.discordapp.com/emojis/1320524607467425924.png?v=1');

    const userSelect = new StringSelectMenuBuilder()
        .setCustomId('select_user_reset')
        .setPlaceholder('اختر المسؤول...')
        .addOptions(userOptionsWithNicknames);

    const components = [
        new ActionRowBuilder().addComponents(userSelect),
        new ActionRowBuilder().addComponents([
            new ButtonBuilder()
                .setCustomId('back_to_main_reset')
                .setLabel('Main menu')
                .setStyle(ButtonStyle.Secondary)
        ])
    ];

    await interaction.update({ embeds: [userEmbed], components: components });

    const userFilter = i => i.user.id === interaction.user.id;
    const userCollector = interaction.message.createMessageComponentCollector({ 
        filter: userFilter, 
        time: 300000 
    });

    userCollector.on('collect', async userInt => {
        try {
            if (userInt.customId === 'back_to_main_reset') {
                const currentPoints = readJSONFile(pointsPath, {});
                const currentResponsibilities = readJSONFile(responsibilitiesPath, {});
                const embed = createMainEmbed(currentPoints, currentResponsibilities);
                const components = createMainComponents();
                await userInt.update({ embeds: [embed], components: components });
                return;
            }

            if (userInt.customId === 'select_user_reset') {
                const selectedUserId = userInt.values[0];
                await handleUserResetConfirmation(userInt, selectedUserId, selectedResp, allUsers, points, responsibilities, client);
            }

            if (userInt.customId.startsWith('confirm_user_reset_')) {
                const [, , , userId, respType] = userInt.customId.split('_');
                await executeUserReset(userInt, userId, respType, points, responsibilities, client);
            }
        } catch (error) {
            console.error('خطأ في معالج المستخدمين:', error);
            await handleInteractionError(userInt, error);
        }
    });
}

async function handleUserResetConfirmation(interaction, userId, selectedResp, allUsers, points, responsibilities, client) {
    const userData = allUsers.find(u => u.id === userId);

    let displayName = `مستخدم ${userId.slice(-4)}`;
    try {
        const member = await interaction.guild.members.fetch(userId);
        displayName = member.displayName || member.user.username;
    } catch (error) {
        console.log('فشل في جلب معلومات المستخدم');
    }

    const confirmEmbed = colorManager.createEmbed()
        .setTitle('**Reset**')
        .setDescription(`**هل أنت متأكد من تصفير نقاط "${displayName}"؟**`)
        .setColor('#ff9500')
        .addFields([
            { name: '**will dl**', value: `${userData.totalPoints} نقطة`, inline: true },
            { name: '**Res**', value: `${userData.responsibilities}`, inline: true },
            { name: '**From**', value: selectedResp === 'all_responsibilities' ? 'جميع المسؤوليات' : selectedResp, inline: true }
        ])
        .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400670784019628163/download__11_-removebg-preview.png?ex=688d7bd2&is=688c2a52&hm=40d42fba69b5b3423b7821140751dbff0e640e95f1ffc9f65b44a038fe0c5764&');

    const confirmButtons = new ActionRowBuilder().addComponents([
        new ButtonBuilder()
            .setCustomId(`confirm_user_reset_${userId}_${selectedResp}`)
            .setLabel('ok')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('back_to_main_reset')
            .setLabel('cancel')
            .setStyle(ButtonStyle.Secondary)
    ]);

    await interaction.update({ embeds: [confirmEmbed], components: [confirmButtons] });
}

async function executeUserReset(interaction, userId, respType, points, responsibilities, client) {
    await interaction.deferUpdate();

    try {
        let deletedPoints = 0;
        let displayName = `مستخدم ${userId.slice(-4)}`;

        try {
            const member = await interaction.guild.members.fetch(userId);
            displayName = member.displayName || member.user.username;
        } catch (error) {
            console.log('فشل في جلب معلومات المستخدم');
        }

        if (respType === 'all_responsibilities') {
            // حذف نقاط المستخدم من جميع المسؤوليات
            for (const responsibility in points) {
                if (points[responsibility][userId]) {
                    if (typeof points[responsibility][userId] === 'object') {
                        deletedPoints += Object.values(points[responsibility][userId]).reduce((sum, val) => sum + val, 0);
                    } else {
                        deletedPoints += points[responsibility][userId] || 0;
                    }
                    delete points[responsibility][userId];
                }
            }
        } else {
            // حذف نقاط المستخدم من مسؤولية محددة فقط
            if (points[respType] && points[respType][userId]) {
                if (typeof points[respType][userId] === 'object') {
                    deletedPoints = Object.values(points[respType][userId]).reduce((sum, val) => sum + val, 0);
                } else {
                    deletedPoints = points[respType][userId] || 0;
                }
                delete points[respType][userId];
            }
        }

        // حفظ البيانات
        const saveSuccess = writeJSONFile(pointsPath, points);

        if (!saveSuccess) {
            throw new Error('فشل في حفظ البيانات');
        }

        const resultEmbed = colorManager.createEmbed()
            .setTitle('**✅rseted**')
            .setDescription(`**تم تصفير نقاط "${displayName}" بنجاح**`)
            .setColor('#00ff00')
            .addFields([
                { name: '**Deleted**', value: `${deletedPoints}`, inline: true },
                { name: '**From**', value: respType === 'all_responsibilities' ? 'جميع المسؤوليات' : respType, inline: true }
            ])
            .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400672460558303252/images__10_-removebg-preview.png?ex=688d7d61&is=688c2be1&hm=d98e0873eeb313e329ff2c665c3e7a29e117a16f85e77e5815b78369615850aa&')
            .setTimestamp();

        const backButton = new ActionRowBuilder().addComponents([
            new ButtonBuilder()
                .setCustomId('back_to_main_reset')
                .setLabel('Main menu')
                .setStyle(ButtonStyle.Primary)
        ]);

        await interaction.editReply({ embeds: [resultEmbed], components: [backButton] });

        // تسجيل العملية
        logEvent(client, interaction.guild, {
            type: 'POINT_SYSTEM',
            title: 'تصفير مسؤول',
            description: `تم تصفير نقاط ${displayName} من ${respType === 'all_responsibilities' ? 'جميع المسؤوليات' : respType} - ${deletedPoints} نقطة`,
            user: interaction.user
        });
    } catch (error) {
        console.error('خطأ في تصفير المستخدم:', error);
        throw error;
    }
}

async function handleManagePoints(interaction, points, responsibilities, client) {
    const allUsers = getAllUsersWithPoints(points, responsibilities);

    if (allUsers.length === 0) {
        const embed = createMainEmbed(points, responsibilities);
        const components = createMainComponents();
        await interaction.update({
            content: '**❌ لا يوجد مسؤولين لديهم نقاط**',
            embeds: [embed],
            components: components
        });
        return;
    }

    // إنشاء الـ embed مع قائمة المسؤولين مرقمة
    let description = '**اختر المسؤول بالرقم للتعديل على نقاطه:**\n\n';
    const userMap = new Map();

    for (let i = 0; i < Math.min(allUsers.length, 20); i++) {
        const user = allUsers[i];
        let displayName = `مستخدم ${user.id.slice(-4)}`;

        try {
            const member = await interaction.guild.members.fetch(user.id);
            displayName = member.displayName || member.user.username;
        } catch (error) {
            // keep default name
        }

        const userNumber = i + 1;
        description += `**${userNumber}.** ${displayName} - ${user.totalPoints} نقطة\n`;
        userMap.set(userNumber.toString(), {
            userId: user.id,
            displayName: displayName,
            totalPoints: user.totalPoints
        });
    }

    const manageEmbed = colorManager.createEmbed()
        .setTitle('**Manage Points**')
        .setDescription(description)
        .setColor('#9b59b6')
        .setFooter({ text: 'استخدم زر التعديل واختر الرقم للمسؤول' })
        .setThumbnail('https://cdn.discordapp.com/emojis/1320524607467425924.png?v=1');
    const manageButtons = new ActionRowBuilder().addComponents([
        new ButtonBuilder()            .setCustomId('edit_points_start')
            .setLabel('Edit')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('back_to_main_reset')
            .setLabel('Back')
            .setStyle(ButtonStyle.Secondary)
    ]);

    await interaction.update({ embeds: [manageEmbed], components: [manageButtons] });

    // حفظ بيانات المستخدمين للاستخدام لاحقاً
    if (!client.tempUserData) client.tempUserData = new Map();
    client.tempUserData.set(interaction.user.id, userMap);

    const manageFilter = i => i.user.id === interaction.user.id;
    const manageCollector = interaction.message.createMessageComponentCollector({ 
        filter: manageFilter, 
        time: 300000 
    });

    manageCollector.on('collect', async manageInt => {
        try {
            if (manageInt.customId === 'back_to_main_reset') {
                const currentPoints = readJSONFile(pointsPath, {});
                const currentResponsibilities = readJSONFile(responsibilitiesPath, {});
                const embed = createMainEmbed(currentPoints, currentResponsibilities);
                const components = createMainComponents();
                await manageInt.update({ embeds: [embed], components: components });
                return;
            }

            if (manageInt.customId === 'edit_points_start') {
                await handlePointsEditStart(manageInt, points, responsibilities, client, userMap);
            }
        } catch (error) {
            console.error('خطأ في إدارة النقاط:', error);
            await handleInteractionError(manageInt, error);
        }
    });
}

async function handlePointsEditStart(interaction, points, responsibilities, client, userMap) {
    await interaction.reply({
        content: '**اكتب رقم المسؤول الذي تريد تعديل نقاطه:**',
        ephemeral: true
    });

    const messageFilter = m => m.author.id === interaction.user.id;
    const messageCollector = interaction.channel.createMessageCollector({ 
        filter: messageFilter, 
        time: 60000, 
        max: 1 
    });

    messageCollector.on('collect', async (msg) => {
        try {
            const userNumber = msg.content.trim();
            const userData = userMap.get(userNumber);

            if (!userData) {
                await msg.reply('**❌ رقم غير صحيح! اختر رقم من القائمة.**');
                return;
            }

            await msg.delete().catch(() => {});
            await handleUserResponsibilityChoice(interaction, userData, points, responsibilities, client);
        } catch (error) {
            console.error('خطأ في اختيار المستخدم:', error);
            await msg.reply('**❌ حدث خطأ أثناء المعالجة**');
        }
    });

    messageCollector.on('end', collected => {
        if (collected.size === 0) {
            interaction.followUp({ content: '**⏰ انتهت مهلة الاختيار**', ephemeral: true });
        }
    });
}

async function handleUserResponsibilityChoice(interaction, userData, points, responsibilities, client) {
    // التحقق من المسؤوليات التي يوجد بها المستخدم
    const userResponsibilities = [];
    for (const resp in points) {
        if (points[resp][userData.userId]) {
            const respPoints = typeof points[resp][userData.userId] === 'object' 
                ? Object.values(points[resp][userData.userId]).reduce((sum, val) => sum + val, 0)
                : points[resp][userData.userId];
            userResponsibilities.push({
                name: resp,
                points: respPoints
            });
        }
    }

    if (userResponsibilities.length === 0) {
        await interaction.followUp({
            content: '**❌ هذا المسؤول لا يملك نقاط في أي مسؤولية**',
            ephemeral: true
        });
        return;
    }

    if (userResponsibilities.length === 1) {
        // مسؤولية واحدة فقط، ننتقل مباشرة لتعديل النقاط
        await handlePointsModification(interaction, userData, userResponsibilities[0].name, points, responsibilities, client);
        return;
    }

    // أكثر من مسؤولية، نعرض خيارات
    const respOptions = userResponsibilities.map(resp => ({
        label: resp.name,
        value: resp.name,
        description: `${resp.points} نقطة`
    }));

    // إضافة خيار "جميع المسؤوليات"
    respOptions.push({
        label: 'All Responsibilities',
        value: 'all_responsibilities',
        description: 'تعديل النقاط في جميع المسؤوليات'
    });

    const choiceEmbed = colorManager.createEmbed()
        .setTitle('**Choose Responsibility**')
        .setDescription(`**اختر المسؤولية للمسؤول "${userData.displayName}":**`)
        .setColor('#3498db')
        .setThumbnail('https://cdn.discordapp.com/emojis/1320524607467425924.png?v=1');

    const respSelect = new StringSelectMenuBuilder()
        .setCustomId('select_resp_for_edit')
        .setPlaceholder('اختر المسؤولية...')
        .addOptions(respOptions);

    const components = [new ActionRowBuilder().addComponents(respSelect)];

    const choiceMessage = await interaction.followUp({ 
        embeds: [choiceEmbed], 
        components: components,
        ephemeral: true
    });

    const choiceFilter = i => i.user.id === interaction.user.id;
    const choiceCollector = choiceMessage.createMessageComponentCollector({ 
        filter: choiceFilter, 
        time: 60000 
    });

    choiceCollector.on('collect', async choiceInt => {
        try {
            const selectedResp = choiceInt.values[0];
            await choiceInt.deferUpdate();
            await handlePointsModification(interaction, userData, selectedResp, points, responsibilities, client);
        } catch (error) {
            console.error('خطأ في اختيار المسؤولية:', error);
            await handleInteractionError(choiceInt, error);
        }
    });
}

async function handlePointsModification(interaction, userData, responsibilityName, points, responsibilities, client) {
    await interaction.followUp({
        content: `**اكتب النقاط للمسؤول "${userData.displayName}" في "${responsibilityName}":**\n\n` +
                 '**للإضافة:** +50\n' +
                 '**للحذف:** -30\n' +
                 '**للتعديل المطلق:** 100\n' +
                 '**للتصفير:** 0',
        ephemeral: true
    });

    const pointsFilter = m => m.author.id === interaction.user.id;
    const pointsCollector = interaction.channel.createMessageCollector({ 
        filter: pointsFilter, 
        time: 60000, 
        max: 1 
    });

    pointsCollector.on('collect', async (pointsMsg) => {
        try {
            const pointsInput = pointsMsg.content.trim();
            await pointsMsg.delete().catch(() => {});

            const result = await processPointsModification(userData, responsibilityName, pointsInput, points, responsibilities);

            if (result.success) {
                // حفظ البيانات
                const saveSuccess = writeJSONFile(pointsPath, points);

                if (!saveSuccess) {
                    throw new Error('فشل في حفظ البيانات');
                }

                const resultEmbed = colorManager.createEmbed()
                    .setTitle('**✅ Edit completed**')
                    .setDescription(`**تم تعديل نقاط "${userData.displayName}" بنجاح**`)
                    .setColor('#00ff00')
                    .addFields([
                        { name: '**Operation**', value: result.operation, inline: true },
                        { name: '**Value**', value: result.value, inline: true },
                        { name: '**Result**', value: `${result.newPoints} نقطة`, inline: true },
                        { name: '**Responsibility**', value: responsibilityName === 'all_responsibilities' ? 'جميع المسؤوليات' : responsibilityName, inline: false }
                    ])
                    .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400672460558303252/images__10_-removebg-preview.png?ex=688d7d61&is=688c2be1&hm=d98e0873eeb313e329ff2c665c3e7a29e117a16f85e77e5815b78369615850aa&')
                    .setTimestamp();

                await interaction.followUp({ embeds: [resultEmbed], ephemeral: true });

                // تسجيل العملية
                logEvent(client, interaction.guild, {
                    type: 'POINT_SYSTEM',
                    title: 'تعديل النقاط',
                    description: `تم تعديل نقاط ${userData.displayName} في ${responsibilityName} - ${result.operation}: ${result.value}`,
                    user: interaction.user,
                    fields: [
                        { name: 'النتيجة الجديدة', value: `${result.newPoints} نقطة`, inline: true }
                    ]
                });
            } else {
                await interaction.followUp({
                    content: `**❌ ${result.error}**`,
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('خطأ في تعديل النقاط:', error);
            await interaction.followUp({
                content: '**❌ حدث خطأ أثناء تعديل النقاط**',
                ephemeral: true
            });
        }
    });

    pointsCollector.on('end', collected => {
        if (collected.size === 0) {
            interaction.followUp({ content: '**⏰ انتهت مهلة الإدخال**', ephemeral: true });
        }
    });
}

function processPointsModification(userData, responsibilityName, pointsInput, points, responsibilities) {
    try {
        const now = Date.now();

        // تحليل المدخل
        let operation, value, newPoints = 0;

        if (pointsInput.startsWith('+')) {
            operation = 'إضافة';
            value = parseInt(pointsInput.substring(1));
            if (isNaN(value) || value < 0) {
                return { success: false, error: 'قيمة غير صحيحة للإضافة' };
            }
        } else if (pointsInput.startsWith('-')) {
            operation = 'حذف';
            value = parseInt(pointsInput.substring(1));
            if (isNaN(value) || value < 0) {
                return { success: false, error: 'قيمة غير صحيحة للحذف' };
            }
        } else {
            operation = 'تعديل مطلق';
            value = parseInt(pointsInput);
            if (isNaN(value) || value < 0) {
                return { success: false, error: 'قيمة غير صحيحة للتعديل' };
            }
        }

        if (responsibilityName === 'all_responsibilities') {
            // تطبيق العملية على جميع المسؤوليات
            for (const resp in points) {
                if (points[resp][userData.userId]) {
                    if (operation === 'تعديل مطلق') {
                        points[resp][userData.userId] = { [now]: value };
                        newPoints += value;
                    } else if (operation === 'إضافة') {
                        if (typeof points[resp][userData.userId] === 'object') {
                            points[resp][userData.userId][now] = value;
                        } else {
                            const oldPoints = points[resp][userData.userId];
                            points[resp][userData.userId] = { 
                                [now - 1000]: oldPoints,
                                [now]: value 
                            };
                        }
                        newPoints += Object.values(points[resp][userData.userId]).reduce((sum, val) => sum + val, 0);
                    } else if (operation === 'حذف') {
                        const currentPoints = typeof points[resp][userData.userId] === 'object' 
                            ? Object.values(points[resp][userData.userId]).reduce((sum, val) => sum + val, 0)
                            : points[resp][userData.userId];

                        const remainingPoints = Math.max(0, currentPoints - value);
                        points[resp][userData.userId] = { [now]: remainingPoints };
                        newPoints += remainingPoints;
                    }
                }
            }
        } else {
            // تطبيق العملية على مسؤولية محددة
            if (!points[responsibilityName]) {
                points[responsibilityName] = {};
            }

            if (operation === 'تعديل مطلق') {
                points[responsibilityName][userData.userId] = { [now]: value };
                newPoints = value;
            } else if (operation === 'إضافة') {
                if (!points[responsibilityName][userData.userId]) {
                    points[responsibilityName][userData.userId] = { [now]: value };
                } else if (typeof points[responsibilityName][userData.userId] === 'object') {
                    points[responsibilityName][userData.userId][now] = value;
                } else {
                    const oldPoints = points[responsibilityName][userData.userId];
                    points[responsibilityName][userData.userId] = { 
                        [now - 1000]: oldPoints,
                        [now]: value 
                    };
                }
                newPoints = Object.values(points[responsibilityName][userData.userId]).reduce((sum, val) => sum + val, 0);
            } else if (operation === 'حذف') {
                const currentPoints = points[responsibilityName][userData.userId] 
                    ? (typeof points[responsibilityName][userData.userId] === 'object' 
                        ? Object.values(points[responsibilityName][userData.userId]).reduce((sum, val) => sum + val, 0)
                        : points[responsibilityName][userData.userId])
                    : 0;

                newPoints = Math.max(0, currentPoints - value);
                points[responsibilityName][userData.userId] = { [now]: newPoints };
            }
        }

        return {
            success: true,
            operation,
            value: value.toString(),
            newPoints
        };
    } catch (error) {
        return { success: false, error: 'حدث خطأ في معالجة النقاط' };
    }
}

async function handleResponsibilitiesReset(interaction, points, responsibilities, client) {
    const totalResp = Object.keys(responsibilities).length;
    const totalPoints = calculateTotalPoints(points);

    const confirmEmbed = colorManager.createEmbed()
        .setTitle('** Reset all**')
        .setDescription('** هل أنت متأكد من تصفير جميع المسؤوليات والنقاط؟**')
        .setColor('#ff0000')
        .addFields([
            { name: '**Total res **', value: `${totalResp}`, inline: true },
            { name: '**All points**', value: `${totalPoints}`, inline: true }
        ])
        .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400670784019628163/download__11_-removebg-preview.png?ex=688d7bd2&is=688c2a52&hm=40d42fba69b5b3423b7821140751dbff0e640e95f1ffc9f65b44a038fe0c5764&');

    const confirmButtons = new ActionRowBuilder().addComponents([
        new ButtonBuilder()
            .setCustomId('confirm_delete_all_resp')
            .setLabel('reset all')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('back_to_main_reset')
            .setLabel('No')
            .setStyle(ButtonStyle.Secondary)
    ]);

    await interaction.update({ embeds: [confirmEmbed], components: [confirmButtons] });

    const confirmFilter = i => i.user.id === interaction.user.id;
    const confirmCollector = interaction.message.createMessageComponentCollector({ 
        filter: confirmFilter, 
        time: 60000 
    });

    confirmCollector.on('collect', async confirmInt => {
        try {
            if (confirmInt.customId === 'back_to_main_reset') {
                const currentPoints = readJSONFile(pointsPath, {});
                const currentResponsibilities = readJSONFile(responsibilitiesPath, {});
                const embed = createMainEmbed(currentPoints, currentResponsibilities);
                const components = createMainComponents();
                await confirmInt.update({ embeds: [embed], components: components });
                return;
            }

            if (confirmInt.customId === 'confirm_delete_all_resp') {
                await confirmInt.deferUpdate();

                const respCount = Object.keys(responsibilities).length;
                const pointsCount = calculateTotalPoints(points);

                // حذف جميع المسؤوليات والنقاط
                for (const resp in responsibilities) {
                    delete responsibilities[resp];
                }
                for (const responsibility in points) {
                    points[responsibility] = {};
                }

                // حفظ البيانات
                const pointsSave = writeJSONFile(pointsPath, points);
                const respSave = writeJSONFile(responsibilitiesPath, responsibilities);

                if (!pointsSave || !respSave) {
                    throw new Error('فشل في حفظ البيانات');
                }

                const resultEmbed = colorManager.createEmbed()
                    .setTitle('**✅ Completily reset all**')
                    .setDescription(`**تم تصفير ${respCount} مسؤولية و ${pointsCount} نقطة بنجاح**`)
                    .setColor('#00ff00')
                    .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400672460558303252/images__10_-removebg-preview.png?ex=688d7d61&is=688c2be1&hm=d98e0873eeb313e329ff2c665c3e7a29e117a16f85e77e5815b78369615850aa&')
                    .setTimestamp();

                const backButton = new ActionRowBuilder().addComponents([
                    new ButtonBuilder()
                        .setCustomId('back_to_main_reset')
                        .setLabel('Back')
                        .setStyle(ButtonStyle.Primary)
                ]);

                await confirmInt.editReply({ embeds: [resultEmbed], components: [backButton] });

                // تسجيل العملية
                logEvent(client, interaction.guild, {
                    type: 'ADMIN_ACTIONS',
                    title: 'التصفير الكامل',
                    description: `تم تصفير ${respCount} مسؤولية و ${pointsCount} نقطة`,
                    user: interaction.user
                });
            }
        } catch (error) {
            console.error('خطأ في التصفير الكامل:', error);
            await handleInteractionError(confirmInt, error);
        }
    });
}

// دوال مساعدة لإنشاء المكونات
function createMainEmbed(points, responsibilities) {
    const totalPoints = calculateTotalPoints(points);
    const totalUsers = calculateTotalUsers(points);
    const totalResponsibilities = Object.keys(responsibilities).length;

    return colorManager.createEmbed()
        .setTitle('**Reset sys**')
        .setDescription('**اختر نوع التصفير المطلوب:**')
        .addFields([
            { 
                name: '**Stats**', 
                value: `**المسؤوليات:** ${totalResponsibilities}\n**النقاط:** ${totalPoints}\n**إجمالي المسؤولين:** ${totalUsers}`, 
                inline: false 
            }
        ])
        .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400670548463456306/9908185.png?ex=688d7b99&is=688c2a19&hm=92e3397be8a05852507afb7133dccd47a7c4c2ebca8dbdc26911e65414545ae9&')
        .setFooter({ text: 'By ahmed.' })
        .setTimestamp();
}

function createMainComponents() {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('reset_type_select')
        .setPlaceholder('اختر نوع التصفير...')
        .addOptions([
            {
                label: 'Daily',
                value: 'daily',
                description: 'تصفير النقاط في آخر 24 ساعة'
            },
            {
                label: 'Weekily',
                value: 'weekly',
                description: 'تصفير النقاط في آخر 7 أيام'
            },
            {
                label: 'Monthly',
                value: 'monthly',
                description: 'تصفير النقاط في آخر 30 يوم'
            },
            {
                label: 'Resb',
                value: 'user',
                description: 'تصفير نقاط مسؤول محدد'
            },
            {
                label: 'Res',
                value: 'responsibility',
                description: 'تصفير نقاط مسؤولية محددة'
            },
            {
                label: 'Res&points',
                value: 'responsibilities',
                description: 'تصفير جميع المسؤوليات والنقاط'
            },
            {
                label: 'Mange',
                value: 'manage_points',
                description: 'إضافة أو حذف نقاط لمسؤول معين'
            },
            {
                label: 'All',
                value: 'all_points',
                description: 'تصفير جميع النقاط نهائياً'
            }
        ]);

    const buttons = new ActionRowBuilder().addComponents([
        new ButtonBuilder()
            .setCustomId('reset_refresh')
            .setLabel('Refresh')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('reset_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
    ]);

    return [new ActionRowBuilder().addComponents(selectMenu), buttons];
}

// دوال الحسابات
function calculateTotalPoints(points) {
    let total = 0;
    for (const responsibility in points) {
        for (const userId in points[responsibility]) {
            if (typeof points[responsibility][userId] === 'object') {
                total += Object.values(points[responsibility][userId]).reduce((sum, val) => sum + val, 0);
            } else {
                total += points[responsibility][userId] || 0;
            }
        }
    }
    return total;
}

function calculateTotalUsers(points) {
    const uniqueUsers = new Set();
    for (const responsibility in points) {
        for (const userId in points[responsibility]) {
            uniqueUsers.add(userId);
        }
    }
    return uniqueUsers.size;
}

function calculateResponsibilityPoints(points, responsibility) {
    if (!points[responsibility]) return 0;
    let total = 0;
    for (const userId in points[responsibility]) {
        if (typeof points[responsibility][userId] === 'object') {
            total += Object.values(points[responsibility][userId]).reduce((sum, val) => sum + val, 0);
        } else {
            total += points[responsibility][userId] || 0;
        }
    }
    return total;
}

function calculateAffectedPoints(points, resetType) {
    const now = Date.now();
    let affected = 0;

    const timeRanges = {
        daily: 24 * 60 * 60 * 1000,
        weekly: 7 * 24 * 60 * 60 * 1000,
        monthly: 30 * 24 * 60 * 60 * 1000,
        all_points: 0
    };

    const timeLimit = timeRanges[resetType];

    for (const responsibility in points) {
        for (const userId in points[responsibility]) {
            if (resetType === 'all_points') {
                if (typeof points[responsibility][userId] === 'object') {
                    affected += Object.values(points[responsibility][userId]).reduce((sum, val) => sum + val, 0);
                } else {
                    affected += points[responsibility][userId] || 0;
                }
            } else if (typeof points[responsibility][userId] === 'object') {
                for (const timestamp in points[responsibility][userId]) {
                    if (now - parseInt(timestamp) <= timeLimit) {
                        affected += points[responsibility][userId][timestamp];
                    }
                }
            }
        }
    }

    return affected;
}

function performTimeBasedReset(resetType, points) {
    const now = Date.now();
    let deletedPoints = 0;
    let affectedUsers = 0;

    const timeRanges = {
        daily: 24 * 60 * 60 * 1000,
        weekly: 7 * 24 * 60 * 60 * 1000,
        monthly: 30 * 24 * 60 * 60 * 1000
    };

    if (resetType === 'all_points') {
        for (const responsibility in points) {
            for (const userId in points[responsibility]) {
                if (typeof points[responsibility][userId] === 'object') {
                    deletedPoints += Object.values(points[responsibility][userId]).reduce((sum, val) => sum + val, 0);
                } else {
                    deletedPoints += points[responsibility][userId] || 0;
                }
                affectedUsers++;
            }
            points[responsibility] = {};
        }
    } else {
        const timeLimit = timeRanges[resetType];
        const cutoffTime = now - timeLimit;

        for (const responsibility in points) {
            for (const userId in points[responsibility]) {
                let userAffected = false;

                if (typeof points[responsibility][userId] === 'object') {
                    const timestampsToDelete = [];
                    for (const timestamp in points[responsibility][userId]) {
                        if (parseInt(timestamp) >= cutoffTime) {
                            timestampsToDelete.push(timestamp);
                            deletedPoints += points[responsibility][userId][timestamp];
                            userAffected = true;
                        }
                    }

                    timestampsToDelete.forEach(timestamp => {
                        delete points[responsibility][userId][timestamp];
                    });

                    if (Object.keys(points[responsibility][userId]).length === 0) {
                        delete points[responsibility][userId];
                    }
                } else {
                    const oldPoints = points[responsibility][userId];
                    points[responsibility][userId] = {
                        [now - (35 * 24 * 60 * 60 * 1000)]: oldPoints
                    };
                }

                if (userAffected) affectedUsers++;
            }
        }
    }

    return { deletedPoints, affectedUsers };
}

function getAllUsersWithPoints(points, responsibilities) {
    const userMap = new Map();

    for (const responsibility in points) {
        for (const userId in points[responsibility]) {
            if (!userMap.has(userId)) {
                userMap.set(userId, {
                    id: userId,
                    username: `مسؤول ${userId.slice(-4)}`,
                    totalPoints: 0,
                    responsibilities: 0
                });
            }

            const user = userMap.get(userId);
            user.responsibilities++;

            if (typeof points[responsibility][userId] === 'object') {
                user.totalPoints += Object.values(points[responsibility][userId]).reduce((sum, val) => sum + val, 0);
            } else {
                user.totalPoints += points[responsibility][userId] || 0;
            }
        }
    }

    return Array.from(userMap.values()).sort((a, b) => b.totalPoints - a.totalPoints);
}

function getUsersFromResponsibility(points, responsibilities, responsibilityName) {
    const userMap = new Map();

    if (points[responsibilityName]) {
        for (const userId in points[responsibilityName]) {
            let totalPoints = 0;

            if (typeof points[responsibilityName][userId] === 'object') {
                totalPoints = Object.values(points[responsibilityName][userId]).reduce((sum, val) => sum + val, 0);
            } else {
                totalPoints = points[responsibilityName][userId] || 0;
            }

            userMap.set(userId, {
                id: userId,
                username: `مسؤول ${userId.slice(-4)}`,
                totalPoints,
                responsibilities: 1
            });
        }
    }

    return Array.from(userMap.values()).sort((a, b) => b.totalPoints - a.totalPoints);
}

// دوال مساعدة أخرى
function getResetTypeName(type) {
    const names = {
        daily: 'التصفير اليومي',
        weekly: 'التصفير الأسبوعي', 
        monthly: 'التصفير الشهري',
        all_points: 'التصفير الكامل'
    };
    return names[type] || type;
}

function getResetTypeDescription(type) {
    const descriptions = {
        daily: 'تصفير النقاط في آخر 24 ساعة',
        weekly: 'تصفير النقاط في آخر 7 أيام',
        monthly: 'تصفير النقاط في آخر 30 يوم',
        all_points: 'تصفير جميع النقاط نهائياً'
    };
    return descriptions[type] || type;
}

async function handleDirectReset(message, args, points, responsibilities, saveData, client) {
    if (args.length > 0 && ['responsibilities', 'points', 'both'].includes(args[0])) {
        switch (args[0]) {
            case 'responsibilities':
                const respCount = Object.keys(responsibilities).length;
                for (const resp in responsibilities) {
                    delete responsibilities[resp];
                }
                writeJSONFile(responsibilitiesPath, responsibilities);

                const respResetEmbed = colorManager.createEmbed()
                    .setTitle('**✅ Reseted**')
                    .setDescription(`**تم تصفير ${respCount} مسؤولية بنجاح**`)
                    .setColor('#00ff00')
                    .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400672460558303252/images__10_-removebg-preview.png?ex=688d7d61&is=688c2be1&hm=d98e0873eeb313e329ff2c665c3e7a29e117a16f85e77e5815b78369615850aa&');

                await message.channel.send({ embeds: [respResetEmbed] });

                logEvent(client, message.guild, {
                    type: 'ADMIN_ACTIONS',
                    title: 'تصفير المسؤوليات',
                    description: `تم تصفير ${respCount} مسؤولية`,
                    user: message.author
                });
                return;

            case 'points':
                const pointsCount = calculateTotalPoints(points);
                for (const responsibility in points) {
                    points[responsibility] = {};
                }
                writeJSONFile(pointsPath, points);

                const pointsResetEmbed = colorManager.createEmbed()
                    .setTitle('**✅ Reseted**')
                    .setDescription(`**تم تصفير ${pointsCount} نقطة بنجاح**`)
                    .setColor('#00ff00')
                    .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400672460558303252/images__10_-removebg-preview.png?ex=688d7d61&is=688c2be1&hm=d98e0873eeb313e329ff2c665c3e7a29e117a16f85e77e5815b78369615850aa&');

                await message.channel.send({ embeds: [pointsResetEmbed] });

                logEvent(client, message.guild, {
                    type: 'POINT_SYSTEM',
                    title: 'تصفير النقاط',
                    description: `تم تصفير ${pointsCount} نقطة`,
                    user: message.author
                });
                return;

            case 'both':
                const bothRespCount = Object.keys(responsibilities).length;
                const bothPointsCount = calculateTotalPoints(points);

                for (const resp in responsibilities) {
                    delete responsibilities[resp];
                }
                for (const responsibility in points) {
                    points[responsibility] = {};
                }

                writeJSONFile(pointsPath, points);
                writeJSONFile(responsibilitiesPath, responsibilities);

                const bothResetEmbed = colorManager.createEmbed()
                    .setTitle('** Reseted  **')
                    .setDescription(`**تم تصفير ${bothRespCount} مسؤولية و ${bothPointsCount} نقطة بنجاح**`)
                    .setColor('#00ff00')
                    .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/140067672460558303252/images__10_-removebg-preview.png?ex=688d7d61&is=688c2be1&hm=d98e0873eeb313e329ff2c665c3e7a29e117a16f85e77e5815b78369615850aa&');

                await message.channel.send({ embeds: [bothResetEmbed] });

                logEvent(client, message.guild, {
                    type: 'ADMIN_ACTIONS',
                    title: 'التصفير الكامل',
                    description: `تم تصفير ${bothRespCount} مسؤولية و ${bothPointsCount} نقطة`,
                    user: message.author
                });
                return;
        }
    }
}

async function handleInteractionError(interaction, error) {
    const errorMessages = {
        10008: 'الرسالة غير موجودة أو تم حذفها',
        40060: 'التفاعل تم الرد عليه مسبقاً', 
        10062: 'التفاعل غير معروف أو منتهي الصلاحية',
        50013: 'البوت لا يملك الصلاحيات المطلوبة'
    };

    const errorMessage = errorMessages[error.code] || 'حدث خطأ أثناء التصفير';

    try {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: `**❌ ${errorMessage}**`, ephemeral: true });
        } else if (interaction.deferred) {
            await interaction.editReply({ content: `**❌ ${errorMessage}**` });
        }
    } catch (replyError) {
        console.error('خطأ في إرسال رد الخطأ:', replyError);
    }
}

function disableComponents(message, components) {
    const disabledComponents = components.map(row => {
        const newRow = new ActionRowBuilder();
        row.components.forEach(component => {
            if (component instanceof StringSelectMenuBuilder) {
                newRow.addComponents(StringSelectMenuBuilder.from(component).setDisabled(true));
            } else if (component instanceof ButtonBuilder) {
                newRow.addComponents(ButtonBuilder.from(component).setDisabled(true));
            }
        });
        return newRow;
    });

    message.edit({ components: disabledComponents }).catch(() => {});
}

// دالة آمنة للرد على التفاعلات
async function safeReply(interaction, content, options = {}) {
    try {
        if (!interaction || !interaction.isRepliable()) {
            return false;
        }

        const replyOptions = {
            content,
            ephemeral: true,
            ...options
        };

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply(replyOptions);
            return true;
        } else if (interaction.deferred) {
            await interaction.editReply(replyOptions);
            return true;
        }

        return false;
    } catch (error) {
        console.error('خطأ في safeReply:', error);
        return false;
    }
}

module.exports = { name, execute };