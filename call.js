const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const colorManager = require('../colorManager');
const { checkCooldown, startCooldown } = require('./cooldown');
const { logEvent } = require('../logs_system');

module.exports = {
  name: 'call',
  description: 'استدعاء مسؤول معين',
  async execute(message, args, { responsibilities, points, saveData, BOT_OWNERS, ADMIN_ROLES, client }) {
    // Check if user is bot owner only
    const isOwner = BOT_OWNERS.includes(message.author.id) || message.guild.ownerId === message.author.id;

    if (!isOwner) {
      await message.react('❌');
      return;
    }

    if (args.length === 0) {
      const helpEmbed = new EmbedBuilder()
        .setTitle('call Command')
        .setDescription('**استخدم الأمر لاستدعاء مسؤول معين**')
        .addFields([
          { name: '** الاستخدام **', value: '**`call [اسم المسؤولية]`**', inline: false },
          { name: '**مثال**', value: '**`call باند`**', inline: false }
        ])
        .setColor(colorManager.getColor(client))
        .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400637278900191312/images__7_-removebg-preview.png?ex=688d5c9d&is=688c0b1d&hm=8d5c6d761dcf9bda65af44b9de09a2817cbc273f061eb1e39cc8ac20de37cfc0&');

      await message.channel.send({ embeds: [helpEmbed] });
      return;
    }

    const responsibilityName = args.join(' ');

    if (!responsibilities[responsibilityName]) {
      const errorEmbed = new EmbedBuilder()
        .setDescription(`**المسؤولية " ${responsibilityName} " غير موجودة!**`)
        .setColor(colorManager.getColor(client))
        .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400390888416608286/download__3_-removebg-preview.png?ex=688c7725&is=688b25a5&hm=7bb9dd5437fc4c2678e2d5d6592b4e9c87d9485c60d99562616790e85d376bf6&');

      await message.channel.send({ embeds: [errorEmbed] });
      return;
    }

    const responsibility = responsibilities[responsibilityName];
    const responsibles = responsibility.responsibles || [];

    if (responsibles.length === 0) {
      const errorEmbed = new EmbedBuilder()
        .setDescription(`**لا يوجد مسؤولين معينين لمسؤولية "${responsibilityName}"**`)
        .setColor(colorManager.getColor(client))
        .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400390144795738175/download__2_-removebg-preview.png?ex=688d1f34&is=688bcdb4&hm=40da8d91a92062c95eb9d48f307697ec0010860aca64dd3f8c3c045f3c2aa13a&');

      await message.channel.send({ embeds: [errorEmbed] });
      return;
    }

    // Create buttons for each responsible
    const buttons = [];
    let responsiblesList = '';

    for (let i = 0; i < responsibles.length; i++) {
      const userId = responsibles[i];
      try {
        const user = await client.users.fetch(userId);
        responsiblesList += `${i + 1}. <@${userId}>\n`;
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`call_contact_${responsibilityName}_${userId}`)
            .setLabel(`${i + 1}`)
            .setStyle(ButtonStyle.Primary)
        );
      } catch (error) {
        console.error(`Failed to fetch user ${userId}:`, error);
      }
    }

    // Add "All" button
    if (buttons.length > 0) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`call_contact_${responsibilityName}_all`)
          .setLabel('الكل')
          .setStyle(ButtonStyle.Success)
      );
    }

    const embed = new EmbedBuilder()
      .setTitle(` استدعاء مسؤولي : ${responsibilityName}`)
      .setDescription(`**المسؤولين المتاحين :**\n${responsiblesList}\n**اختر من تريد استدعائه:**`)
      .setColor(colorManager.getColor(client))
      .setThumbnail('https://cdn.discordapp.com/attachments/1393840634149736508/1398112822533296210/images__5_-removebg-preview.png?ex=6886d088&is=68857f08&hm=950384c7a5f17d80587a746b4669f9efc6863848a62cbf5440d5177ed708bfc5&');

    const actionRows = [];
    for (let i = 0; i < buttons.length; i += 5) {
      actionRows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }

    await message.channel.send({ embeds: [embed], components: actionRows });

    // Handle button interactions  
    const buttonCollector = message.channel.createMessageComponentCollector({ 
      filter: i => i.user.id === message.author.id && i.customId.startsWith('call_contact_'), 
      time: 300000 
    });

    buttonCollector.on('collect', async interaction => {
      try {
        if (!interaction || !interaction.isRepliable()) {
          console.log('تم تجاهل تفاعل غير صالح أو منتهي الصلاحية');
          return;
        }

        const parts = interaction.customId.split('_');
        const target = parts[3]; // userId or 'all'

        // Check cooldown
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
          .setCustomId(`call_reason_modal_${responsibilityName}_${target}_${Date.now()}`)
          .setTitle('Owners Call');

        const reasonInput = new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setPlaceholder('اكتب سبب الاستدعاء (اختياري)');

        const actionRow = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(actionRow);

        if (!interaction.replied && !interaction.deferred) {
          await interaction.showModal(modal);
        }
        const { quickLog } = require('../logs_system');
              quickLog.adminCallRequested(client, interaction.guild, responsibilityName, reasonInput.value, target, interaction.user);
        // Log the event
        //logEvent(client, interaction.guild, {
        //  type: 'TASK_LOGS',
        //  title: 'Admin Calling Responsible',
        //  description: `**اونر يستدعي مسؤول "${responsibilityName}"**`,
        //  user: interaction.user,
        //  fields: [
        //    { name: '**الهدف**', value: target === 'all' ? '**الكل**' : `<@${target}>` }
        //  ]
        //});
      } catch (error) {
        console.error('خطأ في معالج الأزرار:', error);

        const ignoredErrorCodes = [10008, 40060, 10062, 10003, 50013, 50001];
        if (ignoredErrorCodes.includes(error.code)) {
          console.log(`تم تجاهل خطأ معروف: ${error.code} - ${error.message}`);
          return;
        }

        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
              content: '**حدث خطأ أثناء معالجة الطلب.**', 
              ephemeral: true 
            });
          }
        } catch (replyError) {
          console.error('خطأ في إرسال رد الخطأ:', replyError);
        }
      }
    });

    buttonCollector.on('end', () => {
      // Disable buttons after timeout
      const disabledRows = actionRows.map(row => {
        const newRow = new ActionRowBuilder();
        row.components.forEach(button => {
          newRow.addComponents(ButtonBuilder.from(button).setDisabled(true));
        });
        return newRow;
      });

      message.channel.messages.fetch(message.id).then(msg => {
        if (msg) {

        const timeoutEmbed = new EmbedBuilder()
            .setDescription('**انتهت مهلة الاستدعاء**')
            .setColor(colorManager.getColor(client))
            .setFooter({text: 'By Ahmed'})
            .setThumbnail('https://cdn.discordapp.com/attachments/1373799493111386243/1400390888416608286/download__3_-removebg-preview.png?ex=688d1fe5&is=688bce65&hm=55055a587668561ce27baf0665663f801e14662d4bf849351564a563b1e53b41&');

          msg.edit({ embeds: [timeoutEmbed], components: disabledRows }).catch(console.error);
        }
      }).catch(console.error);
    });
  },
};