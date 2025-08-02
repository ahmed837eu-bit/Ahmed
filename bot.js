const { Client, GatewayIntentBits, Partials, Collection, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { logEvent } = require('./utils/logs_system.js');
const { startReminderSystem } = require('./commands/notifications.js');
const { checkCooldown, startCooldown } = require('./commands/cooldown.js');
const colorManager = require('./utils/colorManager.js');

dotenv.config();

// مسارات ملفات البيانات
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const DATA_FILES = {
    points: path.join(dataDir, 'points.json'),
    responsibilities: path.join(dataDir, 'responsibilities.json'),
    logConfig: path.join(dataDir, 'logConfig.json'),
    adminRoles: path.join(dataDir, 'adminRoles.json'),
    botConfig: path.join(dataDir, 'botConfig.json'),
    cooldowns: path.join(dataDir, 'cooldowns.json'),
    notifications: path.join(dataDir, 'notifications.json')
};

// دالة لقراءة ملف JSON
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

// دالة لكتابة ملف JSON
function writeJSONFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`خطأ في كتابة ${filePath}:`, error);
        return false;
    }
}

// تحميل البيانات مباشرة من الملفات
let points = readJSONFile(DATA_FILES.points, {});
let responsibilities = readJSONFile(DATA_FILES.responsibilities, {});
let logConfig = readJSONFile(DATA_FILES.logConfig, {
    settings: {
        'RESPONSIBILITY_MANAGEMENT': { enabled: false, channelId: null },
        'RESPONSIBLE_MEMBERS': { enabled: false, channelId: null },
        'TASK_LOGS': { enabled: false, channelId: null },
        'POINT_SYSTEM': { enabled: false, channelId: null },
        'ADMIN_ACTIONS': { enabled: false, channelId: null },
        'NOTIFICATION_SYSTEM': { enabled: false, channelId: null },
        'COOLDOWN_SYSTEM': { enabled: false, channelId: null },
        'SETUP_ACTIONS': { enabled: false, channelId: null },
        'BOT_SETTINGS': { enabled: false, channelId: null },
        'ADMIN_CALLS': { enabled: false, channelId: null }
    }
});

// تحميل ADMIN_ROLES من JSON مباشرة
function loadAdminRoles() {
    try {
        const adminRolesData = readJSONFile(DATA_FILES.adminRoles, []);
        return Array.isArray(adminRolesData) ? adminRolesData : [];
    } catch (error) {
        console.error('خطأ في تحميل adminRoles:', error);
        return [];
    }
}

let botConfig = readJSONFile(DATA_FILES.botConfig, {
    owners: [],
    prefix: null,
    settings: {},
    activeTasks: {}
});

// لا نحتاج لمتغيرات محلية لـ cooldowns و notifications
// سيتم قراءتها مباشرة من الملفات عند الحاجة

// لا نحتاج لمتغير محلي للبريفكس - سنقرأه مباشرة من JSON

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});

// إعداد قائمة مالكي البوت من ملف botConfig أولاً، ثم متغير البيئة كبديل
let BOT_OWNERS = [];
if (botConfig.owners && Array.isArray(botConfig.owners) && botConfig.owners.length > 0) {
    BOT_OWNERS = botConfig.owners;
    console.log('✅ تم تحميل المالكين من ملف botConfig.json');
} else if (process.env.BOT_OWNERS) {
    BOT_OWNERS = process.env.BOT_OWNERS.split(',').filter(id => id.trim());
    botConfig.owners = BOT_OWNERS;
    writeJSONFile(DATA_FILES.botConfig, botConfig);
    console.log('✅ تم تحميل المالكين من متغير البيئة وحفظهم في botConfig.json');
} else {
    console.log('⚠️ لم يتم العثور على مالكين محددين');
}

client.commands = new Collection();
client.logConfig = logConfig;

// Load commands from the "commands" folder
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  try {
    const command = require(path.join(commandsPath, file));
    if ('name' in command && 'execute' in command) {
      client.commands.set(command.name, command);
      console.log(`Loaded command: ${command.name}`);
    }
  } catch (error) {
    console.error(`Error loading command ${file}:`, error);
  }
}

let isDataDirty = false;

const topCommand = require('./commands/top_leaderboard.js');

// دالة لوضع علامة للحفظ
function scheduleSave() {
    isDataDirty = true;
    if (topCommand.invalidateTopCache) {
        topCommand.invalidateTopCache();
    }
}

// دالة حفظ محدثة - تحفظ فقط عند وجود تغييرات
function saveData(force = false) {
    if (!isDataDirty && !force) {
        return false;
    }

    try {
        // قراءة أحدث البيانات من الملفات أولاً
        const currentPoints = readJSONFile(DATA_FILES.points, {});
        const currentResponsibilities = readJSONFile(DATA_FILES.responsibilities, {});
        const currentLogConfig = readJSONFile(DATA_FILES.logConfig, logConfig);
        const currentAdminRoles = readJSONFile(DATA_FILES.adminRoles, []);
        const currentBotConfig = readJSONFile(DATA_FILES.botConfig, botConfig);

        // دمج البيانات الحالية مع البيانات المحدثة
        const mergedPoints = { ...currentPoints, ...points };
        const mergedResponsibilities = { ...currentResponsibilities, ...responsibilities };
        const mergedLogConfig = { ...currentLogConfig, ...client.logConfig };
        const currentLoadedAdminRoles = loadAdminRoles();
        const mergedAdminRoles = Array.isArray(currentLoadedAdminRoles) ? currentLoadedAdminRoles : currentAdminRoles;
        const mergedBotConfig = { ...currentBotConfig, ...botConfig };

        // حفظ البيانات المدموجة
        writeJSONFile(DATA_FILES.points, mergedPoints);
        writeJSONFile(DATA_FILES.responsibilities, mergedResponsibilities);
        writeJSONFile(DATA_FILES.logConfig, mergedLogConfig);
        writeJSONFile(DATA_FILES.adminRoles, mergedAdminRoles);
        writeJSONFile(DATA_FILES.botConfig, mergedBotConfig);

        // تحديث المتغيرات المحلية
        points = mergedPoints;
        responsibilities = mergedResponsibilities;
        logConfig = mergedLogConfig;
        client.logConfig = mergedLogConfig;
        botConfig = mergedBotConfig;

        console.log('💾 تم حفظ جميع التغييرات في ملفات JSON');
        isDataDirty = false; // إعادة تعيين العلامة بعد الحفظ
        return true;
    } catch (error) {
        console.error('❌ خطأ في حفظ البيانات:', error);
        return false;
    }
}

// Function to update prefix
function updatePrefix(newPrefix) {
  // قراءة أحدث إعدادات البوت من الملف
  const currentBotConfig = readJSONFile(DATA_FILES.botConfig, botConfig);

  const oldPrefix = currentBotConfig.prefix;

  // تحديث البيانات المحلية والملف
  const updatedBotConfig = { ...currentBotConfig, prefix: newPrefix };
  botConfig = updatedBotConfig;

  // حفظ فوري
  const success = writeJSONFile(DATA_FILES.botConfig, updatedBotConfig);

  if (success) {
    // إعادة قراءة البريفكس من الملف للتأكد من التحديث
    const verifyConfig = readJSONFile(DATA_FILES.botConfig, {});
    const actualPrefix = verifyConfig.prefix;

    console.log(`✅ تم تغيير وحفظ البريفكس من "${oldPrefix === null ? 'null' : oldPrefix}" إلى "${actualPrefix === null ? 'null' : actualPrefix}" بنجاح`);
    console.log(`البريفكس النشط حالياً: "${actualPrefix === null ? 'null' : actualPrefix}"`);
  } else {
    console.log(`⚠️ تم تغيير البريفكس ولكن قد تكون هناك مشكلة في الحفظ`);
  }

  // Update VIP command prefix as well
  const vipCommand = client.commands.get('vip');
  if (vipCommand && vipCommand.setCurrentPrefix) {
    vipCommand.setCurrentPrefix(newPrefix);
  }
}

// دالة لإعادة تحميل البيانات من الملفات
function reloadData() {
    try {
        points = readJSONFile(DATA_FILES.points, {});
        responsibilities = readJSONFile(DATA_FILES.responsibilities, {});
        logConfig = readJSONFile(DATA_FILES.logConfig, logConfig);
        client.logConfig = logConfig;

        botConfig = readJSONFile(DATA_FILES.botConfig, botConfig);
        // ADMIN_ROLES, cooldowns, notifications يتم تحميلها ديناميكياً من الملفات عند الحاجة

        console.log('🔄 تم إعادة تحميل جميع البيانات من الملفات');
        return true;
    } catch (error) {
        console.error('❌ خطأ في إعادة تحميل البيانات:', error);
        return false;
    }
}

// دالة تنظيف المعرفات غير الصحيحة
function cleanInvalidUserIds() {
    try {
        let needsSave = false;
        
        // تنظيف responsibilities
        for (const [respName, respData] of Object.entries(responsibilities)) {
            if (respData.responsibles && Array.isArray(respData.responsibles)) {
                const validIds = respData.responsibles.filter(id => {
                    if (typeof id === 'string' && /^\d{17,19}$/.test(id)) {
                        return true;
                    } else {
                        console.log(`تم حذف معرف غير صحيح من مسؤولية ${respName}: ${id}`);
                        needsSave = true;
                        return false;
                    }
                });
                responsibilities[respName].responsibles = validIds;
            }
        }
        
        // تنظيف points
        for (const [respName, respData] of Object.entries(points)) {
            if (respData && typeof respData === 'object') {
                for (const userId of Object.keys(respData)) {
                    if (!/^\d{17,19}$/.test(userId)) {
                        console.log(`تم حذف نقاط لمعرف غير صحيح: ${userId}`);
                        delete points[respName][userId];
                        needsSave = true;
                    }
                }
            }
        }
        
        if (needsSave) {
            saveData();
            console.log('✅ تم تنظيف البيانات من المعرفات غير الصحيحة');
        }
    } catch (error) {
        console.error('❌ خطأ في تنظيف البيانات:', error);
    }
}

// Make functions available globally
global.updatePrefix = updatePrefix;
global.scheduleSave = scheduleSave; // <-- Changed this
global.reloadData = reloadData;
global.cleanInvalidUserIds = cleanInvalidUserIds;

client.once('ready', async () => {
  console.log('**بوت المسؤوليات جاهز للعمل!**');

  // تنظيف البيانات من المعرفات غير الصحيحة
  cleanInvalidUserIds();

  // تهيئة نظام الألوان
  colorManager.initialize(client);
  await colorManager.forceUpdateColor();

  // مراقب لحالة البوت - كل 30 ثانية
  setInterval(() => {
    if (client.ws.status !== 0) { // 0 = READY
      console.log(`⚠️ حالة البوت: ${client.ws.status} - محاولة إعادة الاتصال...`);
    }
  }, 30000);

  // حفظ البيانات بشكل دوري كل 60 ثانية
  setInterval(() => {
    saveData();
  }, 60 * 1000);

  // إنشاء backup تلقائي كل ساعة (معطل حالياً لعدم وجود ملف security.js)
  /*
  setInterval(() => {
    try {
      const securityManager = require('./security');
      securityManager.createBackup();
    } catch (error) {
      console.error('فشل في إنشاء backup:', error);
    }
  }, 60 * 60 * 1000); // كل ساعة
  */

  // قراءة البريفكس من الملف مباشرة
  const currentBotConfig = readJSONFile(DATA_FILES.botConfig, {});
  let currentPrefix = currentBotConfig.prefix;

  // إزالة علامات التنصيص إذا كانت موجودة
  if (currentPrefix && typeof currentPrefix === 'string' && currentPrefix.startsWith('"') && currentPrefix.endsWith('"')) {
    currentPrefix = currentPrefix.slice(1, -1);
  }

  console.log(`البريفكس الحالي: "${currentPrefix === null ? 'null' : currentPrefix}"`);

  // التحقق من نظام الكولداون
  const cooldownData = readJSONFile(DATA_FILES.cooldowns, {});
  console.log(`✅ نظام الكولداون جاهز - الافتراضي: ${(cooldownData.default || 60000) / 1000} ثانية`);

  startReminderSystem(client, responsibilities);

        // تحديث صلاحيات اللوق عند بدء البوت
        setTimeout(async () => {
            try {
                const guild = client.guilds.cache.first();
                if (guild && client.logConfig && client.logConfig.logRoles && client.logConfig.logRoles.length > 0) {
                    const { updateLogPermissions } = require('./commands/logs.js');
                    await updateLogPermissions(guild, client.logConfig.logRoles);
                    console.log('✅ تم تحديث صلاحيات اللوق عند بدء البوت');
                }
            } catch (error) {
                console.error('خطأ في تحديث صلاحيات اللوق عند البدء:', error);
            }
        }, 5000);

  // Set initial prefix for VIP command
  const vipCommand = client.commands.get('vip');
  if (vipCommand && vipCommand.setCurrentPrefix) {
    vipCommand.setCurrentPrefix(currentPrefix);
  }

  // استعادة حالة البوت المحفوظة
  if (vipCommand && vipCommand.restoreBotStatus) {
    setTimeout(() => {
      vipCommand.restoreBotStatus(client);
    }, 2000); // انتظار ثانيتين للتأكد من جاهزية البوت
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // التحقق من منشن البوت فقط (ليس الرولات)
  if (message.mentions.users.has(client.user.id) && !message.mentions.everyone) {
    const currentBotConfig = readJSONFile(DATA_FILES.botConfig, {});
    let PREFIX = currentBotConfig.prefix;

    // إزالة علامات التنصيص إذا كانت موجودة
    if (PREFIX && typeof PREFIX === 'string' && PREFIX.startsWith('"') && PREFIX.endsWith('"')) {
      PREFIX = PREFIX.slice(1, -1);
    }

    const prefixEmbed = colorManager.createEmbed()
      .setTitle('Details')
      .setDescription(`**البريفكس الحالي:** ${PREFIX === null ? '**لا يوجد بريفكس **' : `\`${PREFIX}\``}`)
      .setThumbnail(client.user.displayAvatarURL())
      .addFields([
        { name: 'To Help', value: `${PREFIX === null ? '' : PREFIX}help`, inline: true },

      ])
      .setFooter({ text: 'Res Bot By Ahmed.' });

    await message.channel.send({ embeds: [prefixEmbed] });
    return;
  }

  // قراءة البريفكس من الملف مباشرة في كل رسالة
  const currentBotConfig = readJSONFile(DATA_FILES.botConfig, {});
  let PREFIX = currentBotConfig.prefix;

  // إزالة علامات التنصيص إذا كانت موجودة
  if (PREFIX && typeof PREFIX === 'string' && PREFIX.startsWith('"') && PREFIX.endsWith('"')) {
    PREFIX = PREFIX.slice(1, -1);
  }

  let args, commandName;

  // Handle prefix logic
  let hasPrefix = false;
  if (PREFIX && PREFIX !== null && PREFIX.trim() !== '') {
    if (message.content.startsWith(PREFIX)) {
      hasPrefix = true;
      args = message.content.slice(PREFIX.length).trim().split(/ +/);
      commandName = args.shift().toLowerCase();
    } else {
      return; // Message doesn't start with prefix, ignore
    }
  } else {
    // No prefix mode - process all messages
    args = message.content.trim().split(/ +/);
    commandName = args.shift().toLowerCase();
  }

  const command = client.commands.get(commandName);
  if (!command) return;

  try {
    // Check permissions for each command
    const isOwner = BOT_OWNERS.includes(message.author.id) || message.guild.ownerId === message.author.id;
    const member = await message.guild.members.fetch(message.author.id);
    const ADMIN_ROLES = loadAdminRoles(); // تحميل رولات المشرفين ديناميكياً
    const hasAdminRole = member.roles.cache.some(role => ADMIN_ROLES.includes(role.id));
    const hasAdministrator = member.permissions.has('Administrator');

    // Commands for everyone (help, top)
    if (commandName === 'help' || commandName === 'top') {
      await command.execute(message, args, { responsibilities, points, scheduleSave, BOT_OWNERS, ADMIN_ROLES, client });
    }
    // Commands for admins and owners (مسؤول)
    else if (commandName === 'مسؤول') {
      if (hasAdminRole || isOwner || hasAdministrator) {
        await command.execute(message, args, { responsibilities, points, scheduleSave, BOT_OWNERS, ADMIN_ROLES, client });
      } else {
        await message.react('❌');
        return;
      }
    }
    // Commands for owners only (call, stats, setup)
    else if (commandName === 'call' || commandName === 'stats' || commandName === 'setup') {
      if (isOwner) {
        await command.execute(message, args, { responsibilities, points, scheduleSave, BOT_OWNERS, ADMIN_ROLES, client });
      } else {
        await message.react('❌');
        return;
      }
    }
    // Commands for owners only (all other commands)
    else {
      if (isOwner) {
        await command.execute(message, args, { responsibilities, points, scheduleSave, BOT_OWNERS, ADMIN_ROLES, client });
      } else {
        await message.react('❌');
        return;
      }
    }
  } catch (error) {
    console.error(error);
    await message.react('❌');
  }
});

// Store active tasks to prevent multiple claims - سيتم حفظها في JSON
if (!client.activeTasks) {
  client.activeTasks = new Map();
}

// تحميل المهام النشطة من JSON
function loadActiveTasks() {
  try {
    const currentBotConfig = readJSONFile(DATA_FILES.botConfig, {});
    if (currentBotConfig.activeTasks) {
      const savedTasks = currentBotConfig.activeTasks;
      for (const [key, value] of Object.entries(savedTasks)) {
        client.activeTasks.set(key, value);
      }
      console.log(`✅ تم تحميل ${client.activeTasks.size} مهمة نشطة من JSON`);
    }
  } catch (error) {
    console.error('❌ خطأ في تحميل المهام النشطة:', error);
  }
}

// حفظ المهام النشطة في JSON
function saveActiveTasks() {
  try {
    const activeTasksObj = {};
    for (const [key, value] of client.activeTasks.entries()) {
      activeTasksObj[key] = value;
    }

    // قراءة أحدث إعدادات البوت
    const currentBotConfig = readJSONFile(DATA_FILES.botConfig, botConfig);
    currentBotConfig.activeTasks = activeTasksObj;

    // حفظ البيانات المحدثة
    writeJSONFile(DATA_FILES.botConfig, currentBotConfig);
    botConfig = currentBotConfig;

    console.log(`💾 تم حفظ ${Object.keys(activeTasksObj).length} مهمة نشطة في JSON`);
  } catch (error) {
    console.error('❌ خطأ في حفظ المهام النشطة:', error);
  }
}

// تحميل المهام النشطة عند بدء التشغيل
loadActiveTasks();

// Global interaction handler
client.on('interactionCreate', async interaction => {
  try {
    // Check if interaction is still valid
    if (!interaction || !interaction.isRepliable()) {
      console.log('تم تجاهل تفاعل غير صالح أو منتهي الصلاحية');
      return;
    }

    // التحقق من عمر التفاعل
    const now = Date.now();
    const interactionTime = interaction.createdTimestamp;
    const timeDiff = now - interactionTime;
    
    if (timeDiff > 14 * 60 * 1000) {
      console.log('تم تجاهل تفاعل منتهي الصلاحية');
      return;
    }

    // Handle log system interactions
    if (interaction.customId && (interaction.customId.startsWith('log_') || 
        ['auto_set_logs', 'disable_all_logs', 'manage_log_roles', 'add_log_roles', 'remove_log_roles', 'select_roles_to_add_log', 'select_roles_to_remove_log', 'back_to_main_logs', 'back_to_log_roles_menu', 'add_all_admin_roles_log', 'remove_all_log_roles'].includes(interaction.customId))) {
        console.log(`معالجة تفاعل السجلات: ${interaction.customId}`);

        // تعريف arabicEventTypes للاستخدام في جميع المعالجات
        const arabicEventTypes = {
            'RESPONSIBILITY_MANAGEMENT': 'إدارة المسؤوليات',
            'RESPONSIBLE_MEMBERS': 'مساعدة الاعضاء', 
            'TASK_LOGS': 'المهام',
            'POINT_SYSTEM': 'نظام النقاط',
            'ADMIN_ACTIONS': 'إجراءات الإدارة',
            'NOTIFICATION_SYSTEM': 'نظام التنبيهات',
            'COOLDOWN_SYSTEM': 'نظام الكولداون',
            'SETUP_ACTIONS': 'إجراءات السيتب',
            'BOT_SETTINGS': 'إعدادات البوت',
            'ADMIN_CALLS': 'استدعاء الإداريين'
        };

        const logCommand = client.commands.get('log');
        if (logCommand && logCommand.handleInteraction) {
            await logCommand.handleInteraction(interaction, client, saveData);
        }
        return;
    }

    // Handle adminroles interactions
    if (interaction.customId && (interaction.customId.startsWith('adminroles_') || 
        interaction.customId === 'adminroles_select_role')) {
        console.log(`معالجة تفاعل رولات المشرفين: ${interaction.customId}`);
        // These are handled within the adminroles command itself
        return;
    }

    // Handle cooldown system interactions
    if (interaction.customId && interaction.customId.startsWith('cooldown_')) {
        const cooldownCommand = client.commands.get('cooldown');
        if (cooldownCommand && cooldownCommand.handleInteraction) {
            await cooldownCommand.handleInteraction(interaction, client, saveData, responsibilities);
        }
        return;
    }

    // Handle notifications system interactions
    if (interaction.customId && (interaction.customId.startsWith('notification_') || 
        interaction.customId === 'select_responsibility_time')) {
        const notificationsCommand = client.commands.get('notifications');
        if (notificationsCommand && notificationsCommand.handleInteraction) {
            await notificationsCommand.handleInteraction(interaction, client, responsibilities, saveData);
        }
        return;
    }

    // Handle notifications modal submissions
    if (interaction.isModalSubmit() && (interaction.customId.startsWith('change_global_time_modal') || 
        interaction.customId.startsWith('responsibility_time_modal_'))) {
        const notificationsCommand = client.commands.get('notifications');
        if (notificationsCommand && notificationsCommand.handleModalSubmit) {
            await notificationsCommand.handleModalSubmit(interaction, client, responsibilities);
        }
        return;
    }

    // Handle VIP system interactions
    if (interaction.customId && (interaction.customId.startsWith('vip_') || 
        interaction.customId === 'vip_status_select')) {
        const vipCommand = client.commands.get('vip');
        if (vipCommand && vipCommand.handleInteraction) {
            await vipCommand.handleInteraction(interaction, client, { guild: interaction.guild, author: interaction.user });
        }
        return;
    }

    // Handle VIP modal submissions
    if (interaction.isModalSubmit() && (interaction.customId === 'vip_prefix_modal' || 
        interaction.customId === 'vip_name_modal' || 
        interaction.customId === 'vip_avatar_modal' ||
        interaction.customId === 'vip_banner_modal' ||
        interaction.customId.startsWith('activity_modal_'))) {
        const vipCommand = client.commands.get('vip');
        if (vipCommand && vipCommand.handleModalSubmit) {
            await vipCommand.handleModalSubmit(interaction, client);
        }
        return;
    }

    // Handle claim buttons
    if (interaction.isButton() && interaction.customId.startsWith('claim_task_')) {
      try {
        // منع التفاعلات المتكررة
        if (interaction.replied || interaction.deferred) {
          console.log('تم تجاهل تفاعل متكرر في زر الاستلام');
          return;
        }

        const parts = interaction.customId.split('_');
        if (parts.length < 5) {
          return safeReply(interaction, '**خطأ في معرف المهمة!**');
        }

        const responsibilityName = parts[2];
        const timestamp = parts[3];
        const requesterId = parts[4];
        const taskId = `${responsibilityName}_${timestamp}`;

        // Check if responsibility exists
        if (!responsibilities[responsibilityName]) {
          const errorEmbed = colorManager.createEmbed()
            .setDescription('**حاول مرة اخرى او انتظر دقيقه**')
            .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400667127089856522/1224078115479883816.png?ex=688d786a&is=688c26ea&hm=690357effa104ec0a7e2f728ed55058d79d7a50475dcf981a7e0e6ded68d2c97&');

          return safeReply(interaction, '', { embeds: [errorEmbed] });
        }

        // Check if task is already claimed
        if (client.activeTasks.has(taskId)) {
          const claimedBy = client.activeTasks.get(taskId);
          const claimedEmbed = colorManager.createEmbed()
            .setDescription(`**تم استلام هذه المهمة من قبل ${claimedBy}**`)
            .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400676711439273994/1320524603868712960.png?ex=688d8157&is=688c2fd7&hm=2f0fcafb0d4dd4fc905d6c5c350cfafe7d68e902b5668117f2e7903a62e092c8&');

          return safeReply(interaction, '', { embeds: [claimedEmbed] });
        }

      // Mark task as claimed
      const guild = client.guilds.cache.first();
      let displayName = interaction.user.username;
      if (guild) {
        try {
          const member = await guild.members.fetch(interaction.user.id);
          displayName = member.displayName || member.user.displayName || member.user.username;
        } catch (error) {
          console.error('Failed to fetch member:', error);
        }
      }

      client.activeTasks.set(taskId, displayName);

      // حفظ المهام النشطة في JSON
      saveActiveTasks();

      // Cancel reminder tracking since task is claimed
      const notificationsCommand = client.commands.get('notifications');
      if (notificationsCommand && notificationsCommand.cancelTaskTracking) {
        notificationsCommand.cancelTaskTracking(taskId);
      }

      // Add point to user with timestamp
      if (!points[responsibilityName]) points[responsibilityName] = {};
      if (!points[responsibilityName][interaction.user.id]) {
        points[responsibilityName][interaction.user.id] = {};
      }

      // Convert old format to new format if needed
      if (typeof points[responsibilityName][interaction.user.id] === 'number') {
        const oldPoints = points[responsibilityName][interaction.user.id];
        points[responsibilityName][interaction.user.id] = {
          [Date.now() - (35 * 24 * 60 * 60 * 1000)]: oldPoints // Place old points in the past
        };
      }

      if (!points[responsibilityName][interaction.user.id][timestamp]) {
        points[responsibilityName][interaction.user.id][timestamp] = 0;
      }
      points[responsibilityName][interaction.user.id][timestamp] += 1;
      scheduleSave();

      // Update message to remove button completely
      const successEmbed = colorManager.createEmbed()
        .setDescription(`**تم استلام المهمة من قبل ${displayName}**`)
        .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400676711439273994/1320524603868712960.png?ex=688d8157&is=688c2fd7&hm=2f0fcafb0d4dd4fc905d6c5c350cfafe7d68e902b5668117f2e7903a62e092c8&');

      await interaction.update({
        embeds: [successEmbed],
        components: []
      });

      // Send notification to requester
      try {
        const requester = await client.users.fetch(requesterId);
        const successEmbed = colorManager.createEmbed()
          .setDescription(`**✅ تم استلام دعوتك من مسؤول الـ${responsibilityName} وهو ${displayName}**`)
          .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400676711439273994/1320524603868712960.png?ex=688d8157&is=688c2fd7&hm=2f0fcafb0d4dd4fc905d6c5c350cfafe7d68e902b5668117f2e7903a62e092c8&');

        await requester.send({ embeds: [successEmbed] });
        console.log(`تم إرسال إشعار نجح لطالب المهمة: ${requesterId}`);
      } catch (error) {
        console.log(`لا يمكن إرسال رسالة خاصة لطالب المهمة ${requesterId}: ${error.message}`);
      }

      // Notify all other responsibles that task was claimed
      if (responsibilities[responsibilityName] && responsibilities[responsibilityName].responsibles) {
        const responsibles = responsibilities[responsibilityName].responsibles;
        let notifiedCount = 0;

        for (const userId of responsibles) {
          if (userId !== interaction.user.id) {
            try {
              const user = await client.users.fetch(userId);
              await user.send(`** تم استلام المهمة الخاصة بـ${responsibilityName} من قبل ${displayName}**`);
              notifiedCount++;
            } catch (error) {
              console.log(`لا يمكن إرسال إشعار للمسؤول ${userId}: ${error.message}`);
            }
          }
        }
        console.log(`تم إشعار ${notifiedCount} من المسؤولين الآخرين`);
      }

      // Log the task claimed event
      logEvent(client, guild, {
          type: 'TASK_LOGS',
          title: 'Task Claimed',
          description: `Responsibility: **${responsibilityName}**`,
          user: interaction.user,
          fields: [
              { name: 'Claimed By', value: `<@${interaction.user.id}> (${displayName})`, inline: true },
              { name: 'Requester', value: `<@${requesterId}>`, inline: true },
              { name: 'Channel', value: `<#${interaction.channelId}>`, inline: true }
          ]
      });

      return;
      } catch (error) {
        console.error('خطأ في معالجة زر الاستلام:', error);
        await safeReply(interaction, '**حدث خطأ أثناء استلام المهمة.**');
        return;
      }
    }

    // Handle modal submissions for call
    if (interaction.isModalSubmit() && interaction.customId.startsWith('call_reason_modal_')) {
      // منع التفاعلات المتكررة
      if (interaction.replied || interaction.deferred) {
        console.log('تم تجاهل تفاعل متكرر في نموذج الاستدعاء');
        return;
      }

      const customIdParts = interaction.customId.replace('call_reason_modal_', '').split('_');
      const responsibilityName = customIdParts[0];
      const target = customIdParts[1];
      const reason = interaction.fields.getTextInputValue('reason').trim() || 'لا يوجد سبب محدد';

      if (!responsibilities[responsibilityName]) {
        return interaction.reply({ content: '**المسؤولية غير موجودة!**', ephemeral: true });
      }

      const responsibility = responsibilities[responsibilityName];
      const responsibles = responsibility.responsibles || [];

      if (responsibles.length === 0) {
        return interaction.reply({ content: '**لا يوجد مسؤولين معينين لهذه المسؤولية.**', ephemeral: true });
      }

      // Get original message for navigation
      const originalChannelId = interaction.channelId;
      const originalMessageId = interaction.message?.id;

      const embed = colorManager.createEmbed()
        .setTitle(`Call from owner.`)
        .setDescription(`**المسؤولية:** ${responsibilityName}\n**السبب:** ${reason}\n**المستدعي:** <@${interaction.user.id}>`)
        .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400677612304470086/images__5_-removebg-preview.png?ex=688d822e&is=688c30ae&hm=1ea7a63bb89b38bcd76c0f5668984d7fc919214096a3d3ee92f5d948497fcb51&')
        .setFooter({ text: 'يُرجى الضغط على زر للوصول للاستدعاء  '});

      const goButton = new ButtonBuilder()
        .setCustomId(`go_to_call_${originalChannelId}_${originalMessageId}_${interaction.user.id}`)
        .setLabel('Go to call')
        .setStyle(ButtonStyle.Success);

      const buttonRow = new ActionRowBuilder().addComponents(goButton);

      if (target === 'all') {
        let sentCount = 0;
        for (const userId of responsibles) {
          try {
            const user = await client.users.fetch(userId);
            await user.send({ embeds: [embed], components: [buttonRow] });
            sentCount++;
          } catch (error) {
            console.error(`Failed to send DM to user ${userId}:`, error);
          }
        }

        await interaction.reply({ content: `** تم إرسال الاستدعاء  لـ ${sentCount} من المسؤولين.**`, ephemeral: true });
      } else {
        try {
          const user = await client.users.fetch(target);
          await user.send({ embeds: [embed], components: [buttonRow] });

          await interaction.reply({ content: `** تم إرسال الاستدعاء  إلى <@${target}>.**`, ephemeral: true });
        } catch (error) {
          await interaction.reply({ content: '**فشل في إرسال الرسالة الخاصة.**', ephemeral: true });
        }
      }

      logEvent(client, interaction.guild, {
          type: 'ADMIN_CALLS',
          title: 'Admin Call Requested',
          description: `Admin called responsibility: **${responsibilityName}**`,
          user: interaction.user,
          fields: [
              { name: 'Reason', value: reason, inline: false },
              { name: 'Target', value: target === 'all' ? 'All' : `<@${target}>`, inline: true }
          ]
      });
      return;
    }

    // Handle go to call button
    if (interaction.isButton() && interaction.customId.startsWith('go_to_call_')) {
      try {
        if (interaction.replied || interaction.deferred) {
          console.log('تم تجاهل تفاعل متكرر في زر الذهاب');
          return;
        }

        const parts = interaction.customId.replace('go_to_call_', '').split('_');
        const channelId = parts[0];
        const messageId = parts[1];
        const adminId = parts[2];

        // تعطيل الزر فوراً بعد الضغط عليه
        const disabledButton = new ButtonBuilder()
          .setCustomId(`go_to_call_${channelId}_${messageId}_${adminId}_disabled`)
          .setLabel('تم الاستجابة')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true);

        const disabledRow = new ActionRowBuilder().addComponents(disabledButton);

        const channel = await client.channels.fetch(channelId);
        if (!channel) {
          return interaction.reply({ content: '**لم يتم العثور على القناة!**', ephemeral: true });
        }

        const jumpLink = `https://discord.com/channels/${interaction.guild?.id || '@me'}/${channelId}/${messageId}`;

        const responseEmbed = colorManager.createEmbed()
          .setDescription(`**✅ تم استلام الاستدعاء من <@${adminId}>**\n\n**[اضغط هنا للذهاب للرسالة](${jumpLink})**`)
          .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400677612304470086/images__5_-removebg-preview.png?ex=688d822e&is=688c30ae&hm=1ea7a63bb89b38bcd76c0f5668984d7fc919214096a3d3ee92f5d948497fcb51&');

        // تحديث الرسالة لتعطيل الزر
        await interaction.update({ 
          embeds: [interaction.message.embeds[0]], 
          components: [disabledRow] 
        });

        // إرسال رد منفصل
        await interaction.followUp({ embeds: [responseEmbed], ephemeral: true });

        // Send notification to admin
        try {
          const admin = await client.users.fetch(adminId);
          const notificationEmbed = colorManager.createEmbed()
            .setDescription(`**تم الرد على استدعائك من قبل <@${interaction.user.id}>**`)
            .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400677612304470086/images__5_-removebg-preview.png?ex=688d822e&is=688c30ae&hm=1ea7a63bb89b38bcd76c0f5668984d7fc919214096a3d3ee92f5d948497fcb51&');

          await admin.send({ embeds: [notificationEmbed] });

          // Log the response to admin call
          logEvent(client, interaction.guild, {
              type: 'ADMIN_CALLS',
              title: 'Admin Call Response',
              description: `Response to admin call received`,
              user: interaction.user,
              fields: [
                  { name: 'Admin', value: `<@${adminId}>`, inline: true },
                  { name: 'Response Channel', value: `<#${channelId}>`, inline: true }
              ]
          });
        } catch (error) {
          console.log(`لا يمكن إرسال إشعار للمشرف ${adminId}: ${error.message}`);
        }

      } catch (error) {
        console.error('خطأ في معالجة زر الذهاب:', error);
        await safeReply(interaction, '**حدث خطأ أثناء معالجة الطلب.**');
      }
      return;
    }

    // Handle modal submissions for masoul
    if (interaction.isModalSubmit() && interaction.customId.startsWith('masoul_reason_modal_')) {
      // منع التفاعلات المتكررة
      if (interaction.replied || interaction.deferred) {
        console.log('تم تجاهل تفاعل متكرر في نموذج المسؤول');
        return;
      }

      const customIdParts = interaction.customId.replace('masoul_reason_modal_', '').split('_');
      const responsibilityName = customIdParts[0];
      const target = customIdParts[1];
      const reason = interaction.fields.getTextInputValue('reason').trim();

      if (!responsibilities[responsibilityName]) {
        return interaction.reply({ content: '**المسؤولية غير موجودة!**', ephemeral: true });
      }

      const responsibility = responsibilities[responsibilityName];
      const responsibles = responsibility.responsibles || [];

      if (responsibles.length === 0) {
        return interaction.reply({ content: '**لا يوجد مسؤولين معينين لهذه المسؤولية.**', ephemeral: true });
      }

      const embed = colorManager.createEmbed()
        .setTitle(`**طلب مساعدة في المسؤولية: ${responsibilityName}**`)
        .setDescription(`**السبب :** ${reason}\n
        **من :** ${interaction.user}`)
        .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400678015587057717/1303973825591115846.png?ex=688d828e&is=688c310e&hm=90e53717cc3118b74f7b9b8ecf7e5c2410712de369d95e491f7d05f34fd640ad&');

      const claimButton = new ButtonBuilder()
        .setCustomId(`claim_task_${responsibilityName}_${Date.now()}_${interaction.user.id}`)
        .setLabel('Claim')
        .setStyle(ButtonStyle.Success);

      const buttonRow = new ActionRowBuilder().addComponents(claimButton);

      if (target === 'all') {
        let sentCount = 0;
        for (const userId of responsibles) {
          try {
            const user = await client.users.fetch(userId);
            await user.send({ embeds: [embed], components: [buttonRow] });
            sentCount++;
          } catch (error) {
            console.error(`Failed to send DM to user ${userId}:`, error);
          }
        }

        const taskId = `${responsibilityName}_${Date.now()}`;
        const notificationsCommand = client.commands.get('notifications');
        if (notificationsCommand && notificationsCommand.trackTask) {
          notificationsCommand.trackTask(taskId, responsibilityName, responsibles, client);
        }

        await interaction.reply({ content: `**تم إرسال الطلب لـ ${sentCount} من المسؤولين.**`, ephemeral: true });
      } else {
        try {
          const user = await client.users.fetch(target);
          await user.send({ embeds: [embed], components: [buttonRow] });

          const taskId = `${responsibilityName}_${Date.now()}`;
          const notificationsCommand = client.commands.get('notifications');
          if (notificationsCommand && notificationsCommand.trackTask) {
            notificationsCommand.trackTask(taskId, responsibilityName, [target], client);
          }

          await interaction.reply({ content: `**تم إرسال الطلب إلى ${user.username}.**`, ephemeral: true });
        } catch (error) {
          await interaction.reply({ content: '**فشل في إرسال الرسالة الخاصة.**', ephemeral: true });
        }
      }

      logEvent(client, interaction.guild, {
          type: 'TASK_LOGS',
          title: 'Task Requested',
          description: `Responsibility: **${responsibilityName}**`,
          user: interaction.user,
          fields: [
              { name: 'Reason', value: reason, inline: false },
              { name: 'Target', value: target === 'all' ? 'All' : `<@${target}>`, inline: true }
          ]
      });
      return;
    }

    // Handle modal submissions for setup
    if (interaction.isModalSubmit() && interaction.customId.startsWith('setup_reason_modal_')) {
      // منع التفاعلات المتكررة
      if (interaction.replied || interaction.deferred) {
        console.log('تم تجاهل تفاعل متكرر في نموذج السيتب');
        return;
      }

      const customIdParts = interaction.customId.replace('setup_reason_modal_', '').split('_');
      const responsibilityName = customIdParts[0];
      const target = customIdParts[1];
      let reason = interaction.fields.getTextInputValue('reason').trim();

      // التعامل مع المنشن في النص
      if (reason.includes('<@')) {
        // استخراج المنشن وإزالة العلامات
        reason = reason.replace(/<@!?(\d+)>/g, (match, userId) => {
          try {
            return `<@${userId}>`;
          } catch (error) {
            return match;
          }
        });
      }

      // التعامل مع معرفات المستخدمين في النص
      const userIdPattern = /\b\d{17,19}\b/g;
      const foundIds = reason.match(userIdPattern);
      if (foundIds) {
        for (const id of foundIds) {
          try {
            await client.users.fetch(id);
            reason = reason.replace(new RegExp(`\\b${id}\\b`, 'g'), `<@${id}>`);
          } catch (error) {
            // ID غير صحيح، نتركه كما هو
          }
        }
      }

      if (!reason || reason.trim() === '') {
        reason = 'لا يوجد سبب محدد';
      }

      if (!responsibilities[responsibilityName]) {
        return interaction.reply({ content: '**المسؤولية غير موجودة!**', flags: 64 });
      }

      const responsibility = responsibilities[responsibilityName];
      const responsibles = responsibility.responsibles || [];

      if (responsibles.length === 0) {
        return interaction.reply({ content: '**لا يوجد مسؤولين معينين لهذه المسؤولية.**', flags: 64 });
      }

      // تنظيف قائمة المسؤولين من المعرفات غير الصحيحة
      const validResponsibles = [];
      for (const userId of responsibles) {
        try {
          // التحقق من صحة معرف المستخدم
          if (/^\d{17,19}$/.test(userId)) {
            await client.users.fetch(userId);
            validResponsibles.push(userId);
          } else {
            console.log(`معرف مستخدم غير صحيح تم تجاهله: ${userId}`);
          }
        } catch (error) {
          console.log(`لم يتم العثور على المستخدم: ${userId}`);
        }
      }

      if (validResponsibles.length === 0) {
        return interaction.reply({ content: '**لا يوجد مسؤولين صحيحين لهذه المسؤولية.**', flags: 64 });
      }

      // Check cooldown
      const cooldownTime = checkCooldown(interaction.user.id, responsibilityName);
      if (cooldownTime > 0) {
        return interaction.reply({
          content: `**لقد استخدمت هذا الأمر مؤخرًا. يرجى الانتظار ${Math.ceil(cooldownTime / 1000)} ثانية أخرى.**`,
          flags: 64
        });
      }

      // Start cooldown for user
      startCooldown(interaction.user.id, responsibilityName);

      // Get stored image URL for this user
      const storedImageUrl = client.setupImageData?.get(interaction.user.id);

      const embed = colorManager.createEmbed()
        .setTitle(`**طلب مساعدة في المسؤولية: ${responsibilityName}**`)
        .setDescription(`**السبب:** ${reason}\n**من:** ${interaction.user}`);

      // Add image if available
      if (storedImageUrl) {
        embed.setImage(storedImageUrl);
      }

      const claimButton = new ButtonBuilder()
        .setCustomId(`claim_task_${responsibilityName}_${Date.now()}_${interaction.user.id}`)
        .setLabel('claim')
        .setStyle(ButtonStyle.Success);

      const buttonRow = new ActionRowBuilder().addComponents(claimButton);

      if (target === 'all') {
        // Send to all responsibles
        let sentCount = 0;
        for (const userId of validResponsibles) {
          try {
            const user = await client.users.fetch(userId);
            await user.send({ embeds: [embed], components: [buttonRow] });
            sentCount++;
          } catch (error) {
            console.error(`Failed to send DM to user ${userId}:`, error);
          }
        }

        // Start tracking this task for reminders
        const taskId = `${responsibilityName}_${Date.now()}`;
        const notificationsCommand = client.commands.get('notifications');
        if (notificationsCommand && notificationsCommand.trackTask) {
          notificationsCommand.trackTask(taskId, responsibilityName, validResponsibles, client);
        }

        await interaction.reply({ content: `**تم إرسال الطلب لـ ${sentCount} من المسؤولين.**`, flags: 64 });
      } else {
        // Send to specific user
        try {
          // التحقق من صحة معرف المستخدم المستهدف
          if (!/^\d{17,19}$/.test(target)) {
            return interaction.reply({ content: '**معرف المستخدم المستهدف غير صحيح.**', flags: 64 });
          }

          const user = await client.users.fetch(target);
          await user.send({ embeds: [embed], components: [buttonRow] });

          // Start tracking this task for reminders
          const taskId = `${responsibilityName}_${Date.now()}`;
          const notificationsCommand = client.commands.get('notifications');
          if (notificationsCommand && notificationsCommand.trackTask) {
            notificationsCommand.trackTask(taskId, responsibilityName, [target], client);
          }

          await interaction.reply({ content: `**تم إرسال الطلب إلى ${user.username}.**`, flags: 64 });
        } catch (error) {
          await interaction.reply({ content: '**فشل في إرسال الرسالة الخاصة أو المستخدم غير موجود.**', flags: 64 });
        }
      }

      // Log the task requested event
        logEvent(client, interaction.guild, {
            type: 'TASK_LOGS',
            title: 'Task Requested',
            description: `Responsibility: **${responsibilityName}**`,
            user: interaction.user,
            fields: [
                { name: 'Reason', value: reason, inline: false },
                { name: 'Target', value: target === 'all' ? 'All' : `<@${target}>`, inline: true }
            ]
        });
      return;
    }

  } catch (error) {
    console.error('خطأ في معالج التفاعلات العام:', error);

    // Don't try to respond to specific Discord API errors
    const ignoredErrorCodes = [10008, 40060, 10062, 10003, 50013, 50001, 50027];
    if (ignoredErrorCodes.includes(error.code)) {
      console.log(`تم تجاهل خطأ معروف: ${error.code} - ${error.message}`);
      return;
    }

    // التحقق من عمر التفاعل قبل محاولة الرد
    try {
      const now = Date.now();
      const interactionTime = interaction.createdTimestamp;
      const timeDiff = now - interactionTime;
      
      // لا نحاول الرد إذا مر أكثر من 10 دقائق
      if (timeDiff < 10 * 60 * 1000) {
        await safeReply(interaction, '**حدث خطأ أثناء معالجة الطلب.**');
      } else {
        console.log('تم تجاهل الرد على تفاعل قديم');
      }
    } catch (replyError) {
      console.log('فشل في الرد على الخطأ:', replyError.message);
    }
  }
});

// Helper function for safe replies
async function safeReply(interaction, content, options = {}) {
  try {
    if (!interaction || !interaction.isRepliable()) {
      console.log('لا يمكن الرد على التفاعل - غير صالح أو منتهي الصلاحية');
      return false;
    }

    // التحقق من أن التفاعل لا يزال صالحاً
    const now = Date.now();
    const interactionTime = interaction.createdTimestamp;
    const timeDiff = now - interactionTime;
    
    // إذا مر أكثر من 14 دقيقة على التفاعل، لا نحاول الرد
    if (timeDiff > 14 * 60 * 1000) {
      console.log('التفاعل منتهي الصلاحية - لن يتم الرد');
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
    } else {
      console.log('التفاعل تم الرد عليه مسبقاً');
      return false;
    }
  } catch (error) {
    const ignoredCodes = [10008, 40060, 10062, 10003, 50013, 50001, 50027];
    if (!ignoredCodes.includes(error.code)) {
      console.error('خطأ في الرد الآمن:', error);
    }
    return false;
  }
}

// معالج الإغلاق الآمن
async function gracefulShutdown(signal) {
console.log(`\n🔄 جاري إيقاف البوت بأمان... (${signal})`);

  try {
    // حفظ جميع البيانات بشكل إجباري
    saveData(true);
    console.log('💾 تم حفظ جميع البيانات');

    // إغلاق البوت
    client.destroy();

    console.log('✅ تم إيقاف البوت بنجاح');
    process.exit(0);
  } catch (error) {
    console.error('❌ خطأ أثناء الإغلاق:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// معالج الأخطاء غير المعالجة
process.on('uncaughtException', (error) => {
  // تجاهل أخطاء Discord المعروفة
  const ignoredCodes = [10008, 40060, 10062, 10003, 50013, 50001, 50027];
  if (error.code && ignoredCodes.includes(error.code)) {
    console.log(`تم تجاهل خطأ Discord معروف: ${error.code} - ${error.message}`);
    return;
  }
  
  console.error('❌ خطأ غير معالج:', error);
  
  // حفظ البيانات بدون إيقاف البوت
  try {
    saveData();
    console.log('💾 تم حفظ البيانات بعد الخطأ');
  } catch (saveError) {
    console.error('❌ فشل في حفظ البيانات:', saveError);
  }
  
  // عدم إيقاف البوت للأخطاء البسيطة
  if (error.message && error.message.includes('Unknown interaction')) {
    console.log('🔄 استمرار عمل البوت رغم خطأ التفاعل');
    return;
  }
  
  // إيقاف البوت فقط للأخطاء الخطيرة
  console.log('🛑 خطأ خطير - إيقاف البوت');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  // تجاهل أخطاء Discord المعروفة
  if (reason && reason.code) {
    const ignoredCodes = [10008, 40060, 10062, 10003, 50013, 50001, 50027];
    if (ignoredCodes.includes(reason.code)) {
      console.log(`تم تجاهل رفض Discord معروف: ${reason.code} - ${reason.message}`);
      return;
    }
  }
  
  console.error('❌ رفض غير معالج:', reason);
  
  // حفظ البيانات
  try {
    saveData();
  } catch (saveError) {
    console.error('❌ فشل في حفظ البيانات:', saveError);
  }
});

client.login(process.env.DISCORD_TOKEN);