const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const colorManager = require('../colorManager');
const fs = require('fs');
const path = require('path');

const name = 'top';

// مسارات الملفات
const pointsPath = path.join(__dirname, '..', 'data', 'points.json');
const responsibilitiesPath = path.join(__dirname, '..', 'data', 'responsibilities.json');

// دالة قراءة البيانات المحدثة
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

async function execute(message, args, { points, responsibilities }) {
    // قراءة البيانات المحدثة من الملفات
    const currentPoints = readJSONFile(pointsPath, {});
    const currentResponsibilities = readJSONFile(responsibilitiesPath, {});
    let currentType = 'all';
    let currentResponsibility = null;
    let page = 0;
    const pageSize = 10;

    // التحقق من الأرغيومنت لمسؤولية معينة
    if (args.length > 0) {
        const respName = args.join(' ');
        if (currentResponsibilities[respName]) {
            currentResponsibility = respName;
        }
    }

    function getUserPoints(type = 'all', responsibilityName = null) {
        // قراءة البيانات المحدثة في كل مرة
        const freshPoints = readJSONFile(pointsPath, {});

        const userPoints = {};
        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);
        const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000);

        const pointsToCheck = responsibilityName ? 
            { [responsibilityName]: freshPoints[responsibilityName] || {} } : 
            freshPoints;

        for (const responsibility in pointsToCheck) {
            for (const userId in pointsToCheck[responsibility]) {
                if (typeof pointsToCheck[responsibility][userId] === 'object') {
                    // New format with timestamps
                    const userHistory = pointsToCheck[responsibility][userId];
                    let userTotal = 0;

                    for (const timestamp in userHistory) {
                        const time = parseInt(timestamp);
                        if (type === 'daily' && time >= oneDayAgo) {
                            userTotal += userHistory[timestamp];
                        } else if (type === 'weekly' && time >= oneWeekAgo) {
                            userTotal += userHistory[timestamp];
                        } else if (type === 'monthly' && time >= oneMonthAgo) {
                            userTotal += userHistory[timestamp];
                        } else if (type === 'all') {
                            userTotal += userHistory[timestamp];
                        }
                    }

                    if (userTotal > 0) {
                        userPoints[userId] = (userPoints[userId] || 0) + userTotal;
                    }
                } else {
                    // Old format - treat as all-time points
                    if (type === 'all') {
                        userPoints[userId] = (userPoints[userId] || 0) + pointsToCheck[responsibility][userId];
                    }
                }
            }
        }

        return Object.entries(userPoints).sort((a, b) => b[1] - a[1]);
    }

    const medals = ['🥇', '🥈', '🥉'];
    const badge = (points) => points >= 50 ? '🏆' : points >= 25 ? '⭐' : points >= 10 ? '🎖️' : '';

    function buildEmbed() {
        const sorted = getUserPoints(currentType, currentResponsibility);
        const current = sorted.slice(page * pageSize, (page + 1) * pageSize);

        if (sorted.length === 0) {
            const typeNames = { daily: 'اليومي', weekly: 'الأسبوعي', monthly: 'الشهري', all: 'الكل' };
            const titleSuffix = currentResponsibility ? ` - ${currentResponsibility}` : '';
            const embed = colorManager.createEmbed()
                .setTitle(`🏅 **أفضل المسؤولين - ${typeNames[currentType]}${titleSuffix}**`)
                .setDescription('**لا توجد نقاط في هذه الفترة.**')
                .setColor('#ff9900')
                .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400670537776369765/images__4_-removebg-preview_1.png?ex=688d7b97&is=688c2a17&hm=be9c1a81b818961ab6b6de9d14a2cbefe4f323a47d84c6a012ef9d0165e162e7&')
                .setFooter({ text: 'الصفحة 1 من 1' });
            return embed;
        }

        const desc = current.map(([id, pts], idx) => {
            const rank = page * pageSize + idx + 1;
            const emoji = medals[rank - 1] || `${rank}.`;
            return `${emoji} <@${id}> - **${pts} نقطة** ${badge(pts)}`;
        }).join('\n');

        const typeNames = { daily: 'اليومي', weekly: 'الأسبوعي', monthly: 'الشهري', all: 'الكل' };
        const titleSuffix = currentResponsibility ? ` - ${currentResponsibility}` : '';
        const embed = colorManager.createEmbed()
            .setTitle(`🏅 **أفضل المسؤولين - ${typeNames[currentType]}${titleSuffix}**`)
            .setDescription(desc)
            .setColor('#0099ff')
            .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400670503437598861/download__10_-removebg-preview.png?ex=688d7b8f&is=688c2a0f&hm=bb6f36937f98326d082768a35c61e39f96dd0c7268d0f938c82a53d3d7a81ed8&')
            .setFooter({ text: `الصفحة ${page + 1} من ${Math.ceil(sorted.length / pageSize)}` });
        return embed;
    }

    const typeSelect = new StringSelectMenuBuilder()
        .setCustomId('top_type_select')
        .setPlaceholder('اختر نوع الترتيب...')
        .addOptions([
            { label: 'ترتيب اليوم', value: 'daily', description: 'النقاط المكتسبة خلال آخر 24 ساعة' },
            { label: 'ترتيب الأسبوع', value: 'weekly', description: 'النقاط المكتسبة خلال آخر 7 أيام' },
            { label: 'ترتيب الشهر', value: 'monthly', description: 'النقاط المكتسبة خلال آخر 30 يوم' },
            { label: 'ترتيب الكل', value: 'all', description: 'جميع النقاط منذ البداية' }
        ]);

    // إضافة منيو اختيار المسؤولية
    const respOptions = [{ label: 'جميع المسؤوليات', value: 'all_responsibilities', description: 'عرض ترتيب جميع المسؤولين' }];
    Object.keys(currentResponsibilities).forEach(respName => {
        respOptions.push({
            label: respName,
            value: `resp_${respName}`,
            description: `ترتيب مسؤولي ${respName} فقط`
        });
    });

    const respSelect = new StringSelectMenuBuilder()
        .setCustomId('top_resp_select')
        .setPlaceholder('اختر المسؤولية...')
        .addOptions(respOptions);

    const selectRow1 = new ActionRowBuilder().addComponents(typeSelect);
    const selectRow2 = new ActionRowBuilder().addComponents(respSelect);

    const sorted = getUserPoints(currentType, currentResponsibility);
    const maxPages = Math.ceil(sorted.length / pageSize);

    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('top_prev')
            .setLabel('⬅️ back')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId('top_next')
            .setLabel('next ➡️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= maxPages - 1 || maxPages === 0)
    );

    const sentMessage = await message.channel.send({ 
        embeds: [buildEmbed()], 
        components: [selectRow1, selectRow2, buttonRow] 
    });

    const filter = i => i.user.id === message.author.id && i.message.id === sentMessage.id;
    const collector = message.channel.createMessageComponentCollector({ filter, time: 600000 });

    collector.on('collect', async interaction => {
        try {
            if (interaction.customId === 'top_type_select') {
                currentType = interaction.values[0];
                page = 0;
            } else if (interaction.customId === 'top_resp_select') {
                const value = interaction.values[0];
                if (value === 'all_responsibilities') {
                    currentResponsibility = null;
                } else {
                    currentResponsibility = value.replace('resp_', '');
                }
                page = 0;
            } else if (interaction.customId === 'top_prev' && page > 0) {
                page--;
            } else if (interaction.customId === 'top_next') {
                const sorted = getUserPoints(currentType, currentResponsibility);
                const maxPages = Math.ceil(sorted.length / pageSize);
                if (page < maxPages - 1) {
                    page++;
                }
            }

            const sorted = getUserPoints(currentType, currentResponsibility);
            const maxPages = Math.ceil(sorted.length / pageSize);

            const newButtonRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('top_prev')
                    .setLabel('⬅️ Back')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('top_next')
                    .setLabel('Next ➡️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page >= maxPages - 1 || maxPages === 0)
            );

            await interaction.update({ 
                embeds: [buildEmbed()], 
                components: [selectRow1, selectRow2, newButtonRow] 
            });
        } catch (error) {
            console.error('Error in top leaderboard collector:', error);
        }
    });

    collector.on('end', () => {
        sentMessage.edit({ components: [] }).catch(() => {});
    });
}

module.exports = { name, execute };