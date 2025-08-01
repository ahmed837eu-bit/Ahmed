const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const colorManager = require('../colorManager');
const { logEvent } = require('../logs_system');
const fs = require('fs');
const path = require('path');

const name = 'adminroles';

// مسار ملف رولات المشرفين
const adminRolesPath = path.join(__dirname, '..', 'data', 'adminRoles.json');

// دالة لقراءة رولات المشرفين
function loadAdminRoles() {
  try {
    if (fs.existsSync(adminRolesPath)) {
      const data = fs.readFileSync(adminRolesPath, 'utf8');
      const adminRoles = JSON.parse(data);
      return Array.isArray(adminRoles) ? adminRoles : [];
    }
    return [];
  } catch (error) {
    console.error('خطأ في قراءة adminRoles:', error);
    return [];
  }
}

// دالة لحفظ رولات المشرفين
function saveAdminRoles(adminRoles) {
  try {
    const finalAdminRoles = Array.isArray(adminRoles) ? adminRoles : [];
    fs.writeFileSync(adminRolesPath, JSON.stringify(finalAdminRoles, null, 2));
    console.log('✅ تم حفظ رولات المشرفين في JSON');
    return true;
  } catch (error) {
    console.error('خطأ في حفظ adminRoles:', error);
    return false;
  }
}

async function execute(message, args, { saveData, BOT_OWNERS, client }) {
  if (!BOT_OWNERS.includes(message.author.id)) {

        await message.react('❌');
        return;
  }

  // تحميل رولات المشرفين من الملف مباشرة
  let ADMIN_ROLES = loadAdminRoles();

  // إنشاء الإيمبد الرئيسي
  function createMainEmbed() {
    return colorManager.createEmbed()
      .setTitle('Admin roles')
      .setDescription(`**الرولات الحالية :**\n${ADMIN_ROLES.length > 0 ? ADMIN_ROLES.map((r, i) => `${i + 1}. <@&${r}>`).join('\n') : 'No roles.'}`)
      .setColor('#0099ff')
      .setThumbnail('https://cdn.discordapp.com/emojis/1320524597367410788.png?v=1')
      .setFooter({ text: 'By Ahmed' });
  }

  // Create buttons
  const addButton = new ButtonBuilder()
    .setCustomId('adminroles_add')
    .setLabel('Add')
    .setStyle(ButtonStyle.Success)
    .setEmoji('➕');

  const removeButton = new ButtonBuilder()
    .setCustomId('adminroles_remove')
    .setLabel('Remove')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('➖');

  const listButton = new ButtonBuilder()
    .setCustomId('adminroles_list')
    .setLabel('list')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('📋');

  const row = new ActionRowBuilder().addComponents(addButton, removeButton, listButton);

  const sentMessage = await message.channel.send({ embeds: [createMainEmbed()], components: [row] });

  // Create collector for buttons
  const filter = i => i.user.id === message.author.id && i.message.id === sentMessage.id;
  const collector = message.channel.createMessageComponentCollector({ filter, time: 300000 });

  collector.on('collect', async interaction => {
    try {
      // إعادة تحميل رولات المشرفين في كل تفاعل
      ADMIN_ROLES = loadAdminRoles();

      if (interaction.customId === 'adminroles_add') {
        // Send message asking for roles with mention or ID
        await interaction.reply({ 
          content: '**منشن الرول او الآي دي **',
          ephemeral: true
        });

        // Create message collector
        const messageFilter = m => m.author.id === interaction.user.id;
        const messageCollector = interaction.channel.createMessageCollector({ 
          filter: messageFilter, 
          time: 60000, 
          max: 1 
        });

        messageCollector.on('collect', async (msg) => {
          try {
            await msg.delete().catch(() => {});

            const rolesInput = msg.content.trim();
            const roleIds = rolesInput.split(/\s+/).map(role => role.replace(/[<@&>]/g, '')).filter(id => id);

            if (roleIds.length === 0) {
              return interaction.followUp({ content: '**لم يتم تحديد أي رولات صحيحة.**', ephemeral: true });
            }

            let addedRoles = [];
            let existingRoles = [];
            let invalidRoles = [];

            for (const roleId of roleIds) {
              if (ADMIN_ROLES.includes(roleId)) {
                existingRoles.push(roleId);
              } else {
                try {
                  const role = await interaction.guild.roles.fetch(roleId);
                  if (role) {
                    ADMIN_ROLES.push(roleId);
                    addedRoles.push(roleId);
                  } else {
                    invalidRoles.push(roleId);
                  }
                } catch (error) {
                  invalidRoles.push(roleId);
                }
              }
            }

            // حفظ التغييرات في JSON
            if (addedRoles.length > 0) {
              saveAdminRoles(ADMIN_ROLES);

              // تحديث صلاحيات اللوق
              if (client.logConfig && client.logConfig.logRoles) {
                const { updateLogPermissions } = require('./logs');
                await updateLogPermissions(message.guild, client.logConfig.logRoles);
              }
            }

            // Log the admin role addition
            if (addedRoles.length > 0) {
              logEvent(client, message.guild, {
                type: 'ADMIN_ACTIONS',
                title: 'تمت إضافة رولات اداره',
                description: `تم إضافة ${addedRoles.length} رول جديد لقائمة رولات الاداره`,
                user: message.author,
                fields: [
                  { name: 'الرولات المضافة', value: addedRoles.map(id => `<@&${id}>`).join('\n'), inline: false }
                ]
              });
            }

            let response = '';
            if (addedRoles.length > 0) {
              response += `**✅ Completely Add :**\n ${addedRoles.map(id => `<@&${id}>`).join('\n')}\n\n`;
            }
            if (existingRoles.length > 0) {
              response += `** already in the list :**\n${existingRoles.map(id => `<@&${id}>`).join('\n')}\n\n`;
            }
            if (invalidRoles.length > 0) {
              response += `**❌ رولات غير صحيحة:**\n${invalidRoles.join(', ')}\n\n`;
            }

            await interaction.followUp({ content: response || '**لم يتم إجراء أي تغييرات.**', ephemeral: true });

            // تحديث القائمة الرئيسية
            await sentMessage.edit({ embeds: [createMainEmbed()], components: [row] });
          } catch (error) {
            console.error('Error processing roles:', error);
            await interaction.followUp({ content: '**حدث خطأ أثناء معالجة الرولات.**', ephemeral: true });
          }
        });

        messageCollector.on('end', (collected) => {
          if (collected.size === 0) {
            interaction.followUp({ content: '**انتهت مهلة الانتظار.**', ephemeral: true }).catch(() => {});
          }
        });

      } else if (interaction.customId === 'adminroles_remove') {
        if (ADMIN_ROLES.length === 0) {
          return interaction.reply({ content: '** No roles to delete it **', ephemeral: true });
        }

        // Create numbered list of roles for removal
        let rolesList = '** Choose number :**\n\n';
        for (let i = 0; i < ADMIN_ROLES.length; i++) {
          const roleId = ADMIN_ROLES[i];
          try {
            const role = await message.guild.roles.fetch(roleId);
            const roleName = role ? role.name : 'رول محذوف';
            rolesList += `**${i + 1}.** ${role ? `<@&${roleId}>` : roleName} (${roleName})\n`;
          } catch (error) {
            rolesList += `**${i + 1}.** رول غير موجود (${roleId})\n`;
          }
        }

        rolesList += '\n **تأكد من المسافات بين الارقام**';

        await interaction.reply({ 
          content: rolesList,
          ephemeral: true
        });

        // Create message collector for numbers
        const messageFilter = m => m.author.id === interaction.user.id;
        const messageCollector = interaction.channel.createMessageCollector({ 
          filter: messageFilter, 
          time: 60000, 
          max: 1 
        });

        messageCollector.on('collect', async (msg) => {
          try {
            await msg.delete().catch(() => {});

            const numbersInput = msg.content.trim();
            const numbers = numbersInput.split(/\s+/).map(num => parseInt(num.trim())).filter(num => !isNaN(num) && num > 0 && num <= ADMIN_ROLES.length);

            if (numbers.length === 0) {
              return interaction.followUp({ content: '**لم يتم تحديد أرقام صحيحة.**', ephemeral: true });
            }

            // Sort numbers in descending order to avoid index shifting issues
            numbers.sort((a, b) => b - a);

            let removedRoles = [];
            for (const num of numbers) {
              const roleId = ADMIN_ROLES[num - 1];
              if (roleId) {
                removedRoles.push(roleId);
                ADMIN_ROLES.splice(num - 1, 1);
              }
            }

            // حفظ التغييرات في JSON
            if (removedRoles.length > 0) {
              saveAdminRoles(ADMIN_ROLES);

              // تحديث صلاحيات اللوق
              if (client.logConfig && client.logConfig.logRoles) {
                const { updateLogPermissions } = require('./logs');
                await updateLogPermissions(message.guild, client.logConfig.logRoles);
              }
            }

            // Log the admin role removal
            if (removedRoles.length > 0) {
              logEvent(client, message.guild, {
                type: 'ADMIN_ACTIONS',
                title: 'تمت إزالة رولات الاداره',
                description: `تم حذف ${removedRoles.length} رول من قائمة رولات الادارة`,
                user: message.author,
                fields: [
                  { name: 'الرولات المحذوفة', value: removedRoles.map(id => `<@&${id}>`).join('\n'), inline: false }
                ]
              });
            }

            let response = '';
            if (removedRoles.length > 0) {
              response += `**✅ تمت إزالة الرولات:**\n${removedRoles.map(id => `<@&${id}>`).join('\n')}`;
            }

            await interaction.followUp({ content: response || '**لم يتم إجراء أي تغييرات.**', ephemeral: true });

            // تحديث القائمة الرئيسية
            await sentMessage.edit({ embeds: [createMainEmbed()], components: [row] });
          } catch (error) {
            console.error('Error processing role removal:', error);
            await interaction.followUp({ content: '**حدث خطأ أثناء معالجة الرولات.**', ephemeral: true });
          }
        });

        messageCollector.on('end', (collected) => {
          if (collected.size === 0) {
            interaction.followUp({ content: '**انتهت مهلة الانتظار.**', ephemeral: true }).catch(() => {});
          }
        });

      } else if (interaction.customId === 'adminroles_list') {
        if (ADMIN_ROLES.length === 0) {
          return interaction.reply({ content: '**لا توجد رولات محددة حالياً**', ephemeral: true });
        }

        // Create select menu with roles
        const roleOptions = [];
        for (let i = 0; i < ADMIN_ROLES.length && i < 25; i++) { // Discord limit of 25 options
          const roleId = ADMIN_ROLES[i];
          try {
            const role = await message.guild.roles.fetch(roleId);
            roleOptions.push({
              label: role ? `${i + 1}. ${role.name}` : `${i + 1}. رول محذوف`,
              value: roleId,
              description: role ? `معرف: ${roleId}` : 'رول غير موجود'
            });
          } catch (error) {
            roleOptions.push({
              label: `${i + 1}. رول غير موجود`,
              value: roleId,
              description: 'رول غير موجود'
            });
          }
        }

        const roleSelectMenu = new StringSelectMenuBuilder()
          .setCustomId('adminroles_select_role')
          .setPlaceholder('choose role to view members')
          .addOptions(roleOptions);

        const selectRow = new ActionRowBuilder().addComponents(roleSelectMenu);

        // Back button
        const backButton = new ButtonBuilder()
          .setCustomId('adminroles_back')
          .setLabel('Main menu')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔙');

        const backRow = new ActionRowBuilder().addComponents(backButton);

        const listEmbed = colorManager.createEmbed()
          .setTitle('choose role to show list')
          .setDescription(`**عدد الرولات:** ${ADMIN_ROLES.length}`)
          .setColor('#0099ff')   
          .setFooter({ text: 'By Ahmed.' })
          .setThumbnail('https://cdn.discordapp.com/emojis/1365249109149089813.png?v=1');
        await interaction.update({ embeds: [listEmbed], components: [selectRow, backRow] });

      } else if (interaction.customId === 'adminroles_select_role') {
        const selectedRoleId = interaction.values[0];

        try {
          const role = await message.guild.roles.fetch(selectedRoleId);
          if (!role) {
            return interaction.reply({ content: '**هذا الرول غير موجود.**', ephemeral: true });
          }

          // Get members with mentions and numbers
          const membersArray = Array.from(role.members.values());
          const members = membersArray.map((member, index) => `**${index + 1}.** <@${member.id}>`);

          const memberEmbed = colorManager.createEmbed()
            .setTitle(`Members : ${role.name}`)
            .setDescription(members.length > 0 ? members.join('\n') : '**لا يوجد أعضاء في هذا الرول**')
            .setColor(role.color || '#000000')
            .setThumbnail('https://cdn.discordapp.com/emojis/1320524607467425924.png?v=1')
            .setFooter({ text: ` Members count : ${members.length}` });

          // Back to roles list button
          const backToListButton = new ButtonBuilder()
            .setCustomId('adminroles_list')
            .setLabel('Roles list')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📋');

          // Back to main menu button
          const backToMainButton = new ButtonBuilder()
            .setCustomId('adminroles_back')
            .setLabel('main menu')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔙');

          const buttonRow = new ActionRowBuilder().addComponents(backToListButton, backToMainButton);

          await interaction.update({ embeds: [memberEmbed], components: [buttonRow] });
        } catch (error) {
          await interaction.reply({ content: '**حدث خطأ أثناء جلب معلومات الرول.**', ephemeral: true });
        }

      } else if (interaction.customId === 'adminroles_back') {
        // Return to main menu
        await interaction.update({ embeds: [createMainEmbed()], components: [row] });
      }
    } catch (error) {
      console.error('Error in adminroles collector:', error);
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: '**حدث خطأ أثناء معالجة الطلب.**', ephemeral: true });
        } else {
          await interaction.reply({ content: '**حدث خطأ أثناء معالجة الطلب.**', ephemeral: true });
        }
      } catch (replyError) {
        console.error('Failed to send error reply:', replyError);
      }
    }
  });

  collector.on('end', () => {
    // Disable buttons when collector ends
    const disabledRow = new ActionRowBuilder().addComponents(
      addButton.setDisabled(true),
      removeButton.setDisabled(true),
      listButton.setDisabled(true)
    );
    sentMessage.edit({ components: [disabledRow] }).catch(console.error);
  });
}

module.exports = { name, execute };