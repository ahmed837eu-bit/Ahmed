const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { logEvent } = require('../logs_system');
const colorManager = require('../colorManager');

const name = 'settings';

async function execute(message, args, { responsibilities, client, saveData, BOT_OWNERS }) {
  const isOwner = BOT_OWNERS.includes(message.author.id) || message.guild.ownerId === message.author.id;
  if (!isOwner) {
    await message.react('❌');
    return;
  }

  async function sendSettingsMenu() {
    // Build embed with responsibilities list
    const embed = colorManager.createEmbed()
      .setTitle('**Res sys**')
      .setDescription('Choose res or edit it')
      .setFooter({ text: 'By Ahmed.' }) .setThumbnail('https://cdn.discordapp.com/emojis/1186585722401063032.png?v=1');

    // Build select menu options from responsibilities
    const options = Object.keys(responsibilities).map(key => ({
      label: key,
      description: responsibilities[key].description ? responsibilities[key].description.substring(0, 50) : 'لا يوجد شرح',
      value: key
    }));

    // Add option to add new responsibility
    options.push({
      label: 'res add',
      description: 'إنشاء مسؤولية جديدة',
      value: 'add_new'
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('settings_select_responsibility')
      .setPlaceholder('اختر مسؤولية')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    return await message.channel.send({ embeds: [embed], components: [row] });
  }

  async function updateAllSetupMenus(client) {
    // This function will update all existing setup menus
    // Implementation depends on how you are storing and accessing these menus
    // For example, if you have stored message IDs, you can fetch and edit them
    // Here's a placeholder for the actual implementation
    console.log('Updating all setup menus...');
  }

  const sentMessage = await sendSettingsMenu();

  const filter = i => i.user.id === message.author.id && i.message.id === sentMessage.id;
  const collector = message.channel.createMessageComponentCollector({ filter, time: 600000 });

  collector.on('collect', async interaction => {
    try {
      if (interaction.customId === 'settings_select_responsibility') {
        const selected = interaction.values[0];

        if (selected === 'add_new') {
          // Show modal to add new responsibility
          const modal = new ModalBuilder()
            .setCustomId('add_responsibility_modal')
            .setTitle('**Add new res**');

          const nameInput = new TextInputBuilder()
            .setCustomId('responsibility_name')
            .setLabel('Res name')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('أدخل اسم المسؤولية');

          const descInput = new TextInputBuilder()
            .setCustomId('responsibility_desc')
            .setLabel('Res desc')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setPlaceholder('أدخل شرح المسؤولية أو ضع لا');

          const firstActionRow = new ActionRowBuilder().addComponents(nameInput);
          const secondActionRow = new ActionRowBuilder().addComponents(descInput);

          modal.addComponents(firstActionRow, secondActionRow);

          await interaction.showModal(modal);
        } else {
          // Edit or delete existing responsibility
          const responsibility = responsibilities[selected];

          // Build buttons for edit, delete, add/remove responsible persons
          const editButton = new ButtonBuilder()
            .setCustomId(`edit_${selected}`)
            .setLabel('edit')
            .setStyle(ButtonStyle.Primary);

          const deleteButton = new ButtonBuilder()
            .setCustomId(`delete_${selected}`)
            .setLabel('delete')
            .setStyle(ButtonStyle.Danger);

          const manageButton = new ButtonBuilder()
            .setCustomId(`manage_${selected}`)
            .setLabel('manage')
            .setStyle(ButtonStyle.Secondary);

          const backButton = new ButtonBuilder()
            .setCustomId('back_to_menu')
            .setLabel('main menu')
            .setStyle(ButtonStyle.Secondary);

          const buttonsRow = new ActionRowBuilder().addComponents(editButton, deleteButton, manageButton, backButton);

          const respList = responsibility.responsibles && responsibility.responsibles.length > 0
            ? responsibility.responsibles.map(r => `<@${r}>`).join(', ')
            : '**لا يوجد مسؤولين معينين**';

          const desc = responsibility.description && responsibility.description.toLowerCase() !== 'لا'
            ? responsibility.description
            : '**لا يوجد شرح**';

          const embedEdit = colorManager.createEmbed()
            .setTitle(`**تعديل المسؤولية: ${selected}**`)
            .setDescription(`**المسؤولون:** ${respList}\n**الشرح:** ${desc}`);

          await interaction.update({ embeds: [embedEdit], components: [buttonsRow] });
        }
      } else if (interaction.customId === 'back_to_menu') {
        // Return to main menu
        const embed = colorManager.createEmbed()
          .setTitle('** Res sys**')
          .setDescription('Choose res or edit it')
        .setFooter({ text: 'By Ahmed.' })
        .setThumbnail('https://cdn.discordapp.com/emojis/1186585722401063032.png?v=1');

        const options = Object.keys(responsibilities).map(key => ({
          label: key,
          description: responsibilities[key].description ? responsibilities[key].description.substring(0, 50) : 'لا يوجد شرح',
          value: key
        }));

        options.push({
          label: 'res add',
          description: 'إنشاء مسؤولية جديدة',
          value: 'add_new'
        });

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('settings_select_responsibility')
          .setPlaceholder('اختر مسؤولية')
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.update({ embeds: [embed], components: [row] });
      } else if (interaction.isButton()) {
        const [action, responsibilityName] = interaction.customId.split('_');
        if (!responsibilityName || !responsibilities[responsibilityName]) {
          return interaction.reply({ content: '**المسؤولية غير موجودة!**', ephemeral: true });
        }

        if (action === 'delete') {
          const deletedResponsibility = responsibilities[responsibilityName];
          delete responsibilities[responsibilityName];

          // حفظ البيانات في الملف مباشرة
          const fs = require('fs');
          const path = require('path');
          const responsibilitiesPath = path.join(__dirname, '..', 'data', 'responsibilities.json');

          try {
            fs.writeFileSync(responsibilitiesPath, JSON.stringify(responsibilities, null, 2));
            console.log('✅ تم حفظ المسؤوليات بعد الحذف');
          } catch (error) {
            console.error('خطأ في حفظ المسؤوليات:', error);
          }

          // حفظ البيانات باستخدام دالة saveData أيضاً
          saveData();

          // Update all setup menus when responsibilities change
          try {
            const setupCommand = client.commands.get('setup');
            if (setupCommand && setupCommand.updateAllSetupMenus) {
              setupCommand.updateAllSetupMenus(client);
            }
          } catch (error) {
            console.error('خطأ في تحديث منيو السيتب:', error);
          }

          logEvent(client, message.guild, {
            type: 'RESPONSIBILITY_MANAGEMENT',
            title: 'Responsibility Deleted',
            description: `The responsibility "${responsibilityName}" has been deleted.`,
            user: message.author,
            fields: [
              { name: 'Description', value: deletedResponsibility.description || 'N/A' }
            ]
          });

          await interaction.reply({ content: `**تم حذف المسؤولية : ${responsibilityName}**`, ephemeral: true });

          // Return to main menu after deletion
          setTimeout(async () => {
            const embed = colorManager.createEmbed()
              .setTitle('** res sys**')
              .setDescription('Choose res or edit it')
.setFooter({ text: 'By Ahmed.' })
            .setThumbnail('https://cdn.discordapp.com/emojis/1186585722401063032.png?v=1');
            const options = Object.keys(responsibilities).map(key => ({
              label: key,
              description: responsibilities[key].description ? responsibilities[key].description.substring(0, 50) : 'لا يوجد شرح',
              value: key
            }));

            options.push({
              label:  'res add',
              description: 'إنشاء مسؤولية جديدة',
              value: 'add_new'
            });

            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId('settings_select_responsibility')
              .setPlaceholder('اختر مسؤولية')
              .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await sentMessage.edit({ embeds: [embed], components: [row] });
          }, 2000);
        } else if (action === 'edit') {
          // Show modal to edit description
          const modal = new ModalBuilder()
            .setCustomId(`edit_desc_modal_${responsibilityName}`)
            .setTitle(`**تعديل شرح المسؤولية: ${responsibilityName}**`);

          const descInput = new TextInputBuilder()
            .setCustomId('responsibility_desc')
            .setLabel('شرح المسؤولية (أرسل "لا" لعدم الشرح)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setPlaceholder('أدخل شرح المسؤولية أو اتركه فارغ')
            .setValue(responsibilities[responsibilityName].description || '');

          const actionRow = new ActionRowBuilder().addComponents(descInput);
          modal.addComponents(actionRow);

          await interaction.showModal(modal);
        } else if (action === 'manage') {
          // Show modal to add/remove responsibles
          const modal = new ModalBuilder()
            .setCustomId(`manage_responsibles_modal_${responsibilityName}`)
            .setTitle(`**إدارة المسؤولين: ${responsibilityName}**`);

          const respInput = new TextInputBuilder()
            .setCustomId('responsibles')
            .setLabel('أدخل اي ديهات المسؤولين (افصل بفواصل)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setPlaceholder('أدخل ايديهات المسؤولين افصل بفواصل')
            .setValue(responsibilities[responsibilityName].responsibles ? responsibilities[responsibilityName].responsibles.join(', ') : '');

          const actionRow = new ActionRowBuilder().addComponents(respInput);
          modal.addComponents(actionRow);

          await interaction.showModal(modal);
        }
      }
    } catch (error) {
      console.error('خطأ في معالج إعدادات المسؤوليات:', error);

      // Safe error response
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

  client.on('interactionCreate', async interaction => {
    try {
      if (!interaction.isModalSubmit()) return;
      if (interaction.user.id !== message.author.id) return;

      if (interaction.customId === 'add_responsibility_modal') {
        const name = interaction.fields.getTextInputValue('responsibility_name').trim();
        const desc = interaction.fields.getTextInputValue('responsibility_desc').trim();

        if (!name) {
          return interaction.reply({ content: '**يجب إدخال اسم المسؤولية!**', ephemeral: true });
        }

        if (responsibilities[name]) {
          return interaction.reply({ content: '**هذه المسؤولية موجودة بالفعل!**', ephemeral: true });
        }

        responsibilities[name] = {
          description: (!desc || desc.toLowerCase() === 'لا') ? '' : desc,
          responsibles: []
        };
        // حفظ البيانات
          saveData();

          // Update all setup menus when responsibilities change
          try {
            const setupCommand = client.commands.get('setup');
            if (setupCommand && setupCommand.updateAllSetupMenus) {
              setupCommand.updateAllSetupMenus(client);
            }
          } catch (error) {
            console.error('خطأ في تحديث منيو السيتب:', error);
          }

        // Update all setup menus
        updateAllSetupMenus(client);

        logEvent(client, message.guild, {
          type: 'RESPONSIBILITY_MANAGEMENT',
          title: 'Responsibility Created',
          description: `A new responsibility "${name}" has been created.`,
          user: message.author,
          fields: [
            { name: 'Description', value: desc || 'N/A' }
          ]
        });

        await interaction.reply({ content: `**تم إنشاء المسؤولية: ${name}**\n**الآن منشن المسؤولين أو أرسل ايديهاتهم :**`, ephemeral: true });

        // إنشاء collector لاستقبال الرسائل التي تحتوي على المسؤولين
        const filter = (msg) => msg.author.id === interaction.user.id && !msg.author.bot;
        const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

        collector.on('collect', async (msg) => {
          try {
            let responsibleIds = [];
            
            // استخراج المنشن من الرسالة
            if (msg.mentions.users.size > 0) {
              responsibleIds = msg.mentions.users.map(user => user.id);
            } else {
              // استخراج الايديات من النص
              const idMatches = msg.content.match(/\d{17,19}/g);
              if (idMatches) {
                // التحقق من صحة الايديات
                for (const id of idMatches) {
                  try {
                    await client.users.fetch(id);
                    responsibleIds.push(id);
                  } catch (error) {
                    console.log(`ايدي غير صحيح: ${id}`);
                  }
                }
              }
            }

            if (responsibleIds.length > 0) {
              // تحديث المسؤولية بالمسؤولين
              responsibilities[name].responsibles = responsibleIds;
              saveData();

              // Update all setup menus when responsibilities change
              try {
                const setupCommand = client.commands.get('setup');
                if (setupCommand && setupCommand.updateAllSetupMenus) {
                  setupCommand.updateAllSetupMenus(client);
                }
              } catch (error) {
                console.error('خطأ في تحديث منيو السيتب:', error);
              }

              // حذف رسالة المستخدم
              try {
                await msg.delete();
              } catch (error) {
                console.log('لا يمكن حذف الرسالة');
              }

              // إرسال رسالة تأكيد
              const confirmEmbed = colorManager.createEmbed()
                .setDescription(`**✅ تم تعيين ${responsibleIds.length} مسؤول للمسؤولية: ${name}**`)
                .setColor('#00ff00');

              await interaction.followUp({ embeds: [confirmEmbed], ephemeral: true });

              // تسجيل الحدث
              logEvent(client, interaction.guild, {
                type: 'RESPONSIBILITY_MANAGEMENT',
                title: 'Responsibles Added',
                description: `Responsibles added to "${name}".`,
                user: interaction.user,
                fields: [
                  { name: 'Count', value: `${responsibleIds.length}`, inline: true },
                  { name: 'Responsibles', value: responsibleIds.map(id => `<@${id}>`).join(', '), inline: false }
                ]
              });

              // تحديث المنيو الرئيسي بعد إضافة المسؤولين
              setTimeout(async () => {
                try {
                  const embed = colorManager.createEmbed()
                    .setTitle('**Res sys**')
                    .setDescription('Choose res or edit it')
                    .setFooter({ text: 'By Ahmed.' })
                    .setThumbnail('https://cdn.discordapp.com/emojis/1186585722401063032.png?v=1');

                  const options = Object.keys(responsibilities).map(key => ({
                    label: key,
                    description: responsibilities[key].description ? responsibilities[key].description.substring(0, 50) : 'لا يوجد شرح',
                    value: key
                  }));

                  options.push({
                    label: 'res add',
                    description: 'إنشاء مسؤولية جديدة',
                    value: 'add_new'
                  });

                  const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('settings_select_responsibility')
                    .setPlaceholder('اختر مسؤولية')
                    .addOptions(options);

                  const row = new ActionRowBuilder().addComponents(selectMenu);

                  await sentMessage.edit({ embeds: [embed], components: [row] });
                } catch (error) {
                  console.error('فشل في تحديث المنيو:', error);
                }
              }, 2000);

            } else {
              await interaction.followUp({ 
                content: '**لم يتم العثور على منشن أو ايديات صحيحة. يرجى المحاولة مرة أخرى.**', 
                ephemeral: true 
              });
            }
          } catch (error) {
            console.error('خطأ في معالجة المسؤولين:', error);
            await interaction.followUp({ 
              content: '**حدث خطأ أثناء معالجة المسؤولين.**', 
              ephemeral: true 
            });
          }
        });

        collector.on('end', (collected, reason) => {
          if (reason === 'time' && collected.size === 0) {
            interaction.followUp({
              content: '**انتهت المهلة الزمنية لإدخال المسؤولين.**',
              ephemeral: true
            }).catch(() => {});
          }
        });

        return;

      } else if (interaction.customId.startsWith('edit_desc_modal_')) {
        const collector = message.channel.createMessageCollector({ filter, time: 60000, max: 1 });

        collector.on('collect', async (msg) => {
          const mentions = msg.mentions.users.map(user => user.id);
          const textIds = msg.content.split(',').map(s => s.trim().replace(/[<@!>]/g, '')).filter(s => s.length > 0 && /^\d+$/.test(s));
          const allIds = [...new Set([...mentions, ...textIds])];

          if (allIds.length > 0) {
            responsibilities[name].responsibles = allIds;
            // حفظ البيانات
          saveData();

          // Update all setup menus when responsibilities change
          try {
            const setupCommand = client.commands.get('setup');
            if (setupCommand && setupCommand.updateAllSetupMenus) {
              setupCommand.updateAllSetupMenus(client);
            }
          } catch (error) {
            console.error('خطأ في تحديث منيو السيتب:', error);
          }

            // Notify each assigned responsible via DM
            for (const userId of allIds) {
              try {
                const user = await client.users.fetch(userId);
                await user.send(`**تم تعيينك مسؤولاً على المسؤولية: ${name}**`);
              } catch (error) {
                console.error(`Failed to send DM to user ${userId}:`, error);
              }
            }

            await msg.reply(`**تم تعيين ${allIds.length} مسؤول للمسؤولية: ${name}**`);
          } else {
            await msg.reply(`**لم يتم تعيين أي مسؤولين للمسؤولية: ${name}**`);
          }
        });

        collector.on('end', () => {
          // Update the main menu
          setTimeout(async () => {
            const embed = colorManager.createEmbed()
              .setTitle('** res sys**')
              .setFooter({ text: 'By Ahmed.' })
              .setDescription('Choose res or edit it.')
            .setThumbnail('https://cdn.discordapp.com/emojis/1186585722401063032.png?v=1');

            const options = Object.keys(responsibilities).map(key => ({
              label: key,
              description: responsibilities[key].description ? responsibilities[key].description.substring(0, 50) : 'لا يوجد شرح',
              value: key
            }));

            options.push({
              label: 'res add',
              description: 'إنشاء مسؤولية جديدة',
              value: 'add_new'
            });

            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId('settings_select_responsibility')
              .setPlaceholder('اختر مسؤولية')
              .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await sentMessage.edit({ embeds: [embed], components: [row] });
          }, 3000);
        });
      } else if (interaction.customId.startsWith('edit_desc_modal_')) {
        const responsibilityName = interaction.customId.replace('edit_desc_modal_', '');
        const desc = interaction.fields.getTextInputValue('responsibility_desc').trim();

        if (!responsibilities[responsibilityName]) {
          return interaction.reply({ content: '**المسؤولية غير موجودة!**', ephemeral: true });
        }

        const oldDesc = responsibilities[responsibilityName].description;
        responsibilities[responsibilityName].description = (!desc || desc.toLowerCase() === 'لا') ? '' : desc;
        // حفظ البيانات
          saveData();

          // Update all setup menus when responsibilities change
          try {
            const setupCommand = client.commands.get('setup');
            if (setupCommand && setupCommand.updateAllSetupMenus) {
              setupCommand.updateAllSetupMenus(client);
            }
          } catch (error) {
            console.error('خطأ في تحديث منيو السيتب:', error);
          }

        logEvent(client, message.guild, {
          type: 'RESPONSIBILITY_MANAGEMENT',
          title: 'Responsibility Description Updated',
          description: `The description for "${responsibilityName}" has been updated.`,
          user: message.author,
          fields: [
            { name: 'Old Description', value: oldDesc || 'N/A' },
            { name: 'New Description', value: responsibilities[responsibilityName].description || 'N/A' }
          ]
        });

        await interaction.reply({ content: `**تم تعديل شرح المسؤولية: ${responsibilityName}**`, ephemeral: true });
      } else if (interaction.customId.startsWith('manage_responsibles_modal_')) {
        const responsibilityName = interaction.customId.replace('manage_responsibles_modal_', '');
        const respText = interaction.fields.getTextInputValue('responsibles').trim();

        if (!responsibilities[responsibilityName]) {
          return interaction.reply({ content: '**المسؤولية غير موجودة!**', ephemeral: true });
        }

        // Parse responsibles from input (IDs or mentions)
        const oldResponsibles = responsibilities[responsibilityName].responsibles || [];
        const respIds = respText ? respText.split(',').map(s => s.trim().replace(/[<@!>]/g, '')).filter(s => s.length > 0) : [];

        responsibilities[responsibilityName].responsibles = respIds;
        // حفظ البيانات
          saveData();

          // Update all setup menus when responsibilities change
          try {
            const setupCommand = client.commands.get('setup');
            if (setupCommand && setupCommand.updateAllSetupMenus) {
              setupCommand.updateAllSetupMenus(client);
            }
          } catch (error) {
            console.error('خطأ في تحديث منيو السيتب:', error);
          }

        logEvent(client, message.guild, {
          type: 'RESPONSIBLE_MEMBERS',
          title: 'Responsible Members Updated',
          description: `The responsible members for "${responsibilityName}" have been updated.`,
          user: message.author,
          fields: [
            { name: 'Old Members', value: oldResponsibles.map(id => `<@${id}>`).join(', ') || 'None' },
            { name: 'New Members', value: respIds.map(id => `<@${id}>`).join(', ') || 'None' }
          ]
        });

        await interaction.reply({ content: `**تم تحديث المسؤولين للمسؤولية: ${responsibilityName}**`, ephemeral: true });
      }
    } catch (error) {
      console.error('خطأ في معالج إعدادات المسؤوليات:', error);

      // Safe error response
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
}

module.exports = { name, execute };