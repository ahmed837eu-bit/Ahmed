const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const colorManager = require('../utils/colorManager.js');
const { logEvent } = require('../utils/logs_system.js');
const { checkCooldown, startCooldown } = require('./cooldown.js');
const fs = require('fs');
const path = require('path');

const name = 'مسؤول';

// مسار ملف النقاط
const pointsPath = path.join(__dirname, '..', 'data', 'points.json');

// دالة لقراءة النقاط
function loadPoints() {
    try {
        if (fs.existsSync(pointsPath)) {
            const data = fs.readFileSync(pointsPath, 'utf8');
            return JSON.parse(data);
        }
        return {};
    } catch (error) {
        console.error('خطأ في قراءة points:', error);
        return {};
    }
}

// دالة لحفظ النقاط
function savePoints(points) {
    try {
        fs.writeFileSync(pointsPath, JSON.stringify(points, null, 2));
        return true;
    } catch (error) {
        console.error('خطأ في حفظ points:', error);
        return false;
    }
}

async function execute(message, args, { responsibilities, points, saveData, BOT_OWNERS, ADMIN_ROLES, client }) {

  // التحقق من أمر مسؤوليات
  if (args[0] === 'مسؤوليات') {
    await handleResponsibilitiesCommand(message, args.slice(1), responsibilities, client, BOT_OWNERS);
    return;
  }

  // التحقق إذا تم منشن شخص مع الأمر - عرض مسؤولياته مباشرة
  if (message.mentions.users.size > 0) {
    const isOwner = BOT_OWNERS.includes(message.author.id) || message.guild.ownerId === message.author.id;
    if (!isOwner) {
      await message.react('❌');
      return;
    }

    const targetUser = message.mentions.users.first();
    await showUserResponsibilities(message, targetUser, responsibilities, client);
    return;
  }

  const member = await message.guild.members.fetch(message.author.id);
  const hasAdminRole = member.roles.cache.some(role => ADMIN_ROLES.includes(role.id));
  const isOwner = BOT_OWNERS.includes(message.author.id) || message.guild.ownerId === message.author.id;

  if (!hasAdminRole && !isOwner) {

    await message.react('❌');
    return;
  }

  // Build select menu options from responsibilities
  const options = Object.keys(responsibilities).map(key => ({
    label: key,
    value: key
  }));

  if (options.length === 0) {
    const errorEmbed = colorManager.createEmbed()
      .setDescription('**لا توجد مسؤوليات معرفة حتى الآن.**')
      .setColor('#000000')
      .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400390888416608286/download__3_-removebg-preview.png?ex=688d1fe5&is=688bce65&hm=55055a587668561ce27baf0665663f801e14662d4bf849351564a563b1e53b41&');

    return message.channel.send({ embeds: [errorEmbed] });
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('masoul_select_responsibility')
    .setPlaceholder('اختر مسؤولية')
    .addOptions(options);

  // إضافة زر الإلغاء
  const cancelButton = new ButtonBuilder()
    .setCustomId('cancel_masoul_menu')
    .setLabel('cancel')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('❌');

  const selectRow = new ActionRowBuilder().addComponents(selectMenu);
  const buttonRow = new ActionRowBuilder().addComponents(cancelButton);

  const sentMessage = await message.channel.send({ 
    content: '**اختر مسؤولية من القائمة:**',
    components: [selectRow, buttonRow] 
  });

  const filter = i => i.user.id === message.author.id;
  const collector = message.channel.createMessageComponentCollector({ filter, time: 60000 });

  collector.on('collect', async interaction => {
    // معالجة زر الإلغاء
    if (interaction.customId === 'cancel_masoul_menu') {
      collector.stop('cancelled');
      await interaction.update({
        content: '**تم إلغاء القائمة.**',
        embeds: [],
        components: []
      });
      return;
    }

    if (interaction.customId === 'masoul_select_responsibility') {
      const selected = interaction.values[0];
      const responsibility = responsibilities[selected];
      if (!responsibility) {
        return interaction.reply({ content: '**المسؤولية غير موجودة!**', flags: 64 });
      }

      // Build buttons for each responsible with their nicknames
      const buttons = [];
      if (responsibility.responsibles && responsibility.responsibles.length > 0) {
        for (const userId of responsibility.responsibles) {
          try {
            const member = await message.guild.members.fetch(userId);
            const displayName = member.displayName || member.user.username;
            buttons.push(
              new ButtonBuilder()
                .setCustomId(`masoul_contact_${selected}_${userId}`)
                .setLabel(displayName)
                .setStyle(ButtonStyle.Primary)
            );
          } catch (error) {
            buttons.push(
              new ButtonBuilder()
                .setCustomId(`masoul_contact_${selected}_${userId}`)
                .setLabel(`User ${userId}`)
                .setStyle(ButtonStyle.Primary)
            );
          }
        }
      }

      const allButton = new ButtonBuilder()
        .setCustomId(`masoul_contact_${selected}_all`)
        .setLabel('All')
        .setStyle(ButtonStyle.Success);

      buttons.push(allButton);

      const buttonsRow = new ActionRowBuilder().addComponents(...buttons.slice(0, 5));
      const buttonsRow2 = buttons.length > 5 ? new ActionRowBuilder().addComponents(...buttons.slice(5, 10)) : null;

      // إضافة زر الإلغاء للمسؤولية المحددة
      const cancelButtonForResp = new ButtonBuilder()
        .setCustomId('cancel_masoul_menu')
        .setLabel('cancel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌');

      const components = [buttonsRow];
      if (buttonsRow2) components.push(buttonsRow2);

      // إضافة زر الإلغاء في صف منفصل
      const cancelRow = new ActionRowBuilder().addComponents(cancelButtonForResp);
      components.push(cancelRow);

      const desc = responsibility.description || '**No desc.**';

      const contactEmbed = colorManager.createEmbed()
        .setTitle('** Call resb **')
        .setDescription(`**Res :** __${selected}___\n**Desc :** **${desc}**`)
        .setColor('#000000')
        .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400658571925917707/1303973825591115846.png?ex=688d7072&is=688c1ef2&hm=b7426eb45bc266fb56bd7db0095d9ee331bfcbe8d3a13d95a7b735c185662aaf&');

      await interaction.reply({
        embeds: [contactEmbed],
        components: components,
        flags: 64
      });

      // Update the main menu to refresh
      setTimeout(async () => {
        try {
          const newOptions = Object.keys(responsibilities).map(key => ({
            label: key,
            value: key
          }));

          const newSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('masoul_select_responsibility')
            .setPlaceholder('اختر مسؤولية')
            .addOptions(newOptions);

          const newRow = new ActionRowBuilder().addComponents(newSelectMenu);

          await sentMessage.edit({ content: '**اختر مسؤولية من القائمة:**', components: [newRow] });
        } catch (error) {
          console.error('Failed to update menu:', error);
        }
      }, 2000);
    }
  });

  // Handle button clicks for contacting responsibles
  const buttonCollector = message.channel.createMessageComponentCollector({ 
    filter: i => i.user.id === message.author.id && i.customId.startsWith('masoul_contact_'), 
    time: 600000 
  });

  buttonCollector.on('collect', async interaction => {
    try {
      // Check if interaction is still valid
      if (!interaction || !interaction.isRepliable()) {
        console.log('تم تجاهل تفاعل غير صالح أو منتهي الصلاحية');
        return;
      }

      const parts = interaction.customId.split('_');
      const responsibilityName = parts[2];
      const target = parts[3]; // userId or 'all'

      // Check cooldown using the same system as setup command
      const cooldownTime = checkCooldown(interaction.user.id, responsibilityName);
      if (cooldownTime > 0) {
        if (!interaction.replied && !interaction.deferred) {
          return interaction.reply({
            content: `**لقد استخدمت هذا الأمر مؤخرًا. يرجى الانتظار ${Math.ceil(cooldownTime / 1000)} ثانية أخرى.**`,
            ephemeral: true
          });
        }
        return;
      }

      // Start cooldown for user
      startCooldown(interaction.user.id, responsibilityName);

      // Show modal to enter reason
      const modal = new ModalBuilder()
        .setCustomId(`masoul_reason_modal_${responsibilityName}_${target}_${Date.now()}`)
        .setTitle('Reason for Resb');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('اكتب سبب الحاجة للمسؤول (اختياري)');

      const actionRow = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(actionRow);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.showModal(modal);
      }

      // Log the event
      logEvent(client, interaction.guild, {
        type: 'TASK_LOGS',
        title: 'Contacting Responsible Member',
        description: `**اداري يتواصل مع مسؤول "__${responsibilityName}__"**`,
        user: interaction.user,
        fields: [
          { name: '**الهدف**', value: target === 'all' ? '**الكل**' : `<@${target}>` }
        ]
      });
    } catch (error) {
      console.error('خطأ في معالج الأزرار:', error);

      // Handle specific Discord errors
      const ignoredErrorCodes = [10008, 40060, 10062, 10003, 50013, 50001];
      if (ignoredErrorCodes.includes(error.code)) {
        console.log(`تم تجاهل خطأ معروف: ${error.code} - ${error.message}`);
        return;
      }

      // Safe error response
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: '**حدث خطأ أثناء معالجة الطلب.**', 
            ephemeral: true 
          });
        }
      } catch (replyError) {
        console.error('فشل في إرسال رد الخطأ:', replyError);
      }
    }
  });

  // معالج انتهاء الكولكتر
  collector.on('end', (collected, reason) => {
    if (reason === 'time') {
      // تعطيل الأزرار عند انتهاء الوقت
      const disabledSelectRow = new ActionRowBuilder().addComponents(
        StringSelectMenuBuilder.from(selectMenu).setDisabled(true)
      );
      const disabledButtonRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(cancelButton).setDisabled(true)
      );

      sentMessage.edit({ 
        components: [disabledSelectRow, disabledButtonRow] 
      }).catch(console.error);
    }
  });
}

async function handleResponsibilitiesCommand(message, args, responsibilities, client, BOT_OWNERS) {
    // التحقق من أن المستخدم هو المالك فقط
    const isOwner = BOT_OWNERS.includes(message.author.id) || message.guild.ownerId === message.author.id;

    if (!isOwner) {
        await message.react('❌');
        return;
    }

    if (args.length === 0) {
        const helpEmbed = colorManager.createEmbed()
            .setTitle('مسؤوليات Command')
            .setDescription('**استخدم الأمر لفحص مسؤوليات شخص معين**')
            .addFields([
                { name: '**الاستخدام**', value: '**`مسؤوليات @user`**', inline: false },
                { name: '**مثال**', value: '**`مسؤوليات @احمد`**', inline: false }
            ])
            .setColor('#000000')
            .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400637278900191312/images__7_-removebg-preview.png?ex=688d5c9d&is=688c0b1d&hm=8d5c6d761dcf9bda65af44b9de09a2817cbc273f061eb1e39cc8ac20de37cfc0&');

        await message.channel.send({ embeds: [helpEmbed] });
        return;
    }

    // استخراج المستخدم المطلوب فحصه
    let targetUser = null;

    if (message.mentions.users.size > 0) {
        targetUser = message.mentions.users.first();
    } else {
        // محاولة البحث بالايدي
        const userId = args[0].replace(/[<@!>]/g, '');
        try {
            targetUser = await client.users.fetch(userId);
        } catch (error) {
            const errorEmbed = colorManager.createEmbed()
                .setDescription('**لم يتم العثور على المستخدم. تأكد من منشنته أو كتابة ايديه صحيح.**')
                .setColor('#000000')
                .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400390888416608286/download__3_-removebg-preview.png?ex=688c7725&is=688b25a5&hm=7bb9dd5437fc4c2678e2d5d6592b4e9c87d9485c60d99562616790e85d376bf6&');

            await message.channel.send({ embeds: [errorEmbed] });
            return;
        }
    }

    await showUserResponsibilities(message, targetUser, responsibilities, client);
}

async function showUserResponsibilities(message, targetUser, responsibilities, client) {
    // البحث عن مسؤوليات المستخدم
    const userResponsibilities = [];

    for (const [respName, respData] of Object.entries(responsibilities)) {
        if (respData.responsibles && respData.responsibles.includes(targetUser.id)) {
            userResponsibilities.push({
                name: respName
            });
        }
    }

    // إنشاء الرد
    if (userResponsibilities.length === 0) {
        const noRespEmbed = colorManager.createEmbed()
            .setDescription(`**${targetUser.username} ليس لديه أي مسؤوليات**`)
            .setColor('#000000')
            .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400390144795738175/download__2_-removebg-preview.png?ex=688d1f34&is=688bcdb4&hm=40da8d91a92062c95eb9d48f307697ec0010860aca64dd3f8c3c045f3c2aa13a&');

        await message.channel.send({ embeds: [noRespEmbed] });
    } else {
        // إنشاء قائمة المسؤوليات بدون وصف
        let responsibilitiesList = '';
        userResponsibilities.forEach((resp, index) => {
            responsibilitiesList += `**${index + 1}.** ${resp.name}\n`;
        });

        const respEmbed = colorManager.createEmbed()
            .setTitle(`مسؤوليات ${targetUser.username}`)
            .setDescription(responsibilitiesList)
            .setColor('#00ff00')
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields([
                { name: 'Total Res', value: `${userResponsibilities.length}`, inline: true },
                { name: 'User', value: `<@${targetUser.id}>`, inline: true }
            ])
            .setFooter({ text: 'By Ahmed.' })
            .setTimestamp();

        await message.channel.send({ embeds: [respEmbed] });
    }
}

function showHelpMenu(message, responsibilities, client) {
    const helpEmbed = colorManager.createEmbed()
        .setTitle('Masoul Command Help')
        .setDescription('استخدم هذا الأمر للتواصل مع المسؤولين.')
        .addFields([
            { name: '**إدارة النقاط**', value: '**`مسؤول points`** - إدارة نقاط المسؤولين', inline: false },
            { name: '**إدارة المسؤوليات**', value: '**`مسؤول responsibilities`** - إدارة المسؤوليات', inline: false },
            { name: '**فحص المسؤوليات**', value: '**`مسؤوليات @user`** - فحص مسؤوليات شخص (للاونر فقط)', inline: false },
            { name: '**المساعدة**', value: '**`مسؤول help`** - عرض هذه القائمة', inline: false }
        ])
        .setColor('#000000')
        .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400390888416608286/download__3_-removebg-preview.png?ex=688d1fe5&is=688bce65&hm=55055a587668561ce27baf0665663f801e14662d4bf849351564a563b1e53b41&');

    message.channel.send({ embeds: [helpEmbed] });
}

module.exports = { name, execute };