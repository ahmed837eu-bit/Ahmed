const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const { logEvent } = require('../logs_system');
const { checkCooldown, startCooldown } = require('./cooldown');
const colorManager = require('../colorManager');

const name = 'setup';

// Function to update all setup menus when responsibilities change
function updateAllSetupMenus(client) {
  if (client.setupMenuUpdaters) {
    client.setupMenuUpdaters.forEach(async (updateFunction, messageId) => {
      try {
        await updateFunction();
      } catch (error) {
        console.error(`Failed to update setup menu ${messageId}:`, error);
        // Remove broken updater
        client.setupMenuUpdaters.delete(messageId);
      }
    });
  }
}

// Export the update function for use in other commands
module.exports.updateAllSetupMenus = updateAllSetupMenus;

// Helper function for safe replies
async function safeReply(interaction, content, options = {}) {
  try {
    if (!interaction || !interaction.isRepliable()) {
      console.log('لا يمكن الرد على التفاعل - غير صالح أو منتهي الصلاحية');
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
    const ignoredCodes = [10008, 40060, 10062, 10003, 50013, 50001];
    if (!ignoredCodes.includes(error.code)) {
      console.error('خطأ في الرد الآمن:', error);
    }
    return false;
  }
}

async function execute(message, args, { responsibilities, points, saveData, BOT_OWNERS, client }) {
    const isOwner = BOT_OWNERS.includes(message.author.id) || message.guild.ownerId === message.author.id;
    if (!isOwner) {
        await message.react('❌');
        return;
    }

  // Show image source selection buttons
  const serverBannerButton = new ButtonBuilder()
    .setCustomId('setup_use_server_banner')
    .setLabel('Use banner')
    .setStyle(ButtonStyle.Primary);

  const customImageButton = new ButtonBuilder()
    .setCustomId('setup_use_custom_image')
    .setLabel('New image')
    .setStyle(ButtonStyle.Secondary);

  const imageSourceRow = new ActionRowBuilder().addComponents(serverBannerButton, customImageButton);

  const initialEmbed = colorManager.createEmbed()
    .setTitle('**res setup**')
    .setDescription('**اختار بنر السيرفر او صوره خارجيه **')
    .setThumbnail('https://cdn.discordapp.com/attachments/1342455563669475383/1400716396878364764/f15a9fd853c65cb886e6c0e844770871-removebg-preview.png?ex=688da64d&is=688c54cd&hm=837bf456ddfa9aa2df9f195ccfd7c50c6bf12faf2e5283bde8eb98e0aa00240e&');

  const sentMessage = await message.channel.send({ 
    embeds: [initialEmbed], 
    components: [imageSourceRow] 
  });

  // Handle image source selection
  const imageSourceFilter = i => i.user.id === message.author.id && i.message.id === sentMessage.id;
  const imageSourceCollector = message.channel.createMessageComponentCollector({ 
    filter: imageSourceFilter, 
    time: 300000 
  });

  imageSourceCollector.on('collect', async interaction => {
    try {
      // التحقق من صلاحية التفاعل أولاً
      if (!interaction || !interaction.isRepliable()) {
        console.log('تفاعل غير صالح في اختيار مصدر الصورة');
        return;
      }

      if (interaction.replied || interaction.deferred) {
        console.log('تم تجاهل تفاعل متكرر في اختيار مصدر الصورة');
        return;
      }

      if (interaction.customId === 'setup_use_server_banner') {
        // Use server banner
        let bannerUrl = null;
        try {
          const guild = message.guild;
          if (guild.banner) {
            bannerUrl = guild.bannerURL({ format: 'png', size: 1024 });
          }
        } catch (error) {
          console.error('Error fetching server banner:', error);
        }

        if (!bannerUrl) {
          return safeReply(interaction, '**لا يوجد بنر للسيرفر ! يرجى اختيار صورة أخرى.**');
        }

        // Ask for text to display with banner
        await safeReply(interaction, '**اكتب النص او ارسل__0__ لعدم وضع اي نصوص **');

        // Wait for text response
        const textFilter = m => m.author.id === message.author.id;
        const textCollector = message.channel.createMessageCollector({ 
          filter: textFilter, 
          max: 1 
        });

        textCollector.on('collect', async (msg) => {
          try {
            await msg.delete().catch(() => {});
            const customText = msg.content.trim();
            const displayText = customText === '0' ? null : customText;

            try {
              logEvent(client, message.guild, {
                type: 'SETUP_TEXT_INPUT',
                description: 'cp desc',
                user: { id: message.author.id },
                details: displayText || 'No desc'
              });
            } catch (logError) {
              console.error('Failed to log text input:', logError);
            }

            // Setup channel collector
            const channelFilter = m => m.author.id === message.author.id;
            const channelCollector = message.channel.createMessageCollector({ 
              filter: channelFilter,
              max: 1
            });

            channelCollector.on('collect', async (channelMsg) => {
              try {
                let targetChannel = null;

                // Check if it's a channel mention
                if (channelMsg.mentions.channels.size > 0) {
                  targetChannel = channelMsg.mentions.channels.first();
                } else {
                  // Try to get channel by ID
                  const channelId = channelMsg.content.trim();
                  try {
                    targetChannel = await message.guild.channels.fetch(channelId);
                  } catch (error) {
                    await channelMsg.reply('**لم يتم العثور على الروم ! يرجى المحاولة مرة أخرى.**');
                    return;
                  }
                }

                if (!targetChannel || !targetChannel.isTextBased()) {
                  await channelMsg.reply('**يرجى منشن روم او اي دي**');
                  return;
                }

                // Create a fake interaction object for consistency
                const fakeInteraction = {
                  user: msg.author,
                  reply: async (options) => channelMsg.reply(options),
                  update: async (options) => sentMessage.edit(options)
                };
                await handleImageSelection(fakeInteraction, bannerUrl, responsibilities, message, client, displayText, targetChannel);
              } catch (error) {
                console.error('Error in channel collector:', error);
              }
            });

            channelCollector.on('end', (collected) => {
              try {
                if (collected.size === 0) {
                  message.channel.send('**انتهت مهلة انتظار الروم.**');
                }
              } catch (error) {
                console.error('Error in channel collector end:', error);
              }
            });
          } catch (error) {
            console.error('Error in text collector:', error);
          }
        });

        textCollector.on('end', (collected) => {
          // Remove timeout handling since collector is persistent
        });

      } else if (interaction.customId === 'setup_use_custom_image') {
        // Request custom image
        await safeReply(interaction, '**يرجى إرفاق صورة أو إرسال رابط الصورة:**');

        // Wait for image from user
        const imageFilter = m => m.author.id === message.author.id;
        const imageCollector = message.channel.createMessageCollector({ 
          filter: imageFilter, 
          max: 1 
        });

        imageCollector.on('collect', async (msg) => {
          let imageUrl = null;

          if (msg.attachments.size > 0) {
            const attachment = msg.attachments.first();
            if (attachment.contentType && attachment.contentType.startsWith('image/')) {
              imageUrl = attachment.url;
            } else {
              return msg.reply('**يرجى إرفاق صورة صالحة !**');
            }
          } else if (msg.content.trim()) {
            const url = msg.content.trim();
            if (url.startsWith('http://') || url.startsWith('https://')) {
              // Basic URL validation for images
              if (url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || url.includes('cdn.discordapp.com') || url.includes('media.discordapp.net')) {
                imageUrl = url;
              } else {
                return msg.reply('**يرجى إرسال رابط صورة صالح !**');
              }
            } else {
              return msg.reply('**يرجى إرسال رابط صحيح أو إرفاق صورة !**');
            }
          } else {
            return msg.reply('**يرجى إرفاق صورة أو إرسال رابط !**');
          }

          if (imageUrl) {
            // Ask for text to display with image
            await msg.reply('**اكتب النص مع الصوره او ضع __0__ لعدم وضع نصوص**');

            // Wait for text response
            const textFilter = m => m.author.id === message.author.id;
            const textCollector = message.channel.createMessageCollector({ 
              filter: textFilter, 
              max: 1 
            });

            textCollector.on('collect', async (textMsg) => {
              const customText = textMsg.content.trim();
              const displayText = customText === '0' ? null : customText;

              // Ask for channel to send menu
              await textMsg.reply('**منشن الروم أو اكتب آي دي **');

              // Wait for channel response
              const channelFilter = m => m.author.id === message.author.id;
              const channelCollector = message.channel.createMessageCollector({ 
                filter: channelFilter, 
                max: 1 
              });

              channelCollector.on('collect', async (channelMsg) => {
                let targetChannel = null;

                // Check if it's a channel mention
                if (channelMsg.mentions.channels.size > 0) {
                  targetChannel = channelMsg.mentions.channels.first();
                } else {
                  // Try to get channel by ID
                  const channelId = channelMsg.content.trim();
                  try {
                    targetChannel = await message.guild.channels.fetch(channelId);
                  } catch (error) {
                    return channelMsg.reply('**لم يتم العثور على الروم ! يرجى المحاولة مرة أخرى.**');
                  }
                }

                if (!targetChannel || !targetChannel.isTextBased()) {
                  return channelMsg.reply('**يرجى منشن روم نصي صحيح **');
                }

                // Create a fake interaction object for consistency
                const fakeInteraction = {
                  user: msg.author,
                  reply: async (options) => channelMsg.reply(options),
                  update: async (options) => sentMessage.edit(options)
                };
                await handleImageSelection(fakeInteraction, imageUrl, responsibilities, message, client, displayText, targetChannel);
              });

              channelCollector.on('end', (collected) => {
                if (collected.size === 0) {
                  message.channel.send('**انتهت مهلة انتظار الروم.**');
                }
              });
            });

            textCollector.on('end', (collected) => {
              // Remove timeout handling since collector is persistent
            });
          }
        });

        imageCollector.on('end', (collected) => {
          // Remove timeout handling since collector is persistent
        });
      }
    } catch (error) {
      console.error('Error in image source selection:', error);
      await safeReply(interaction, '**حدث خطأ أثناء معالجة الطلب.**');
    }
  });

  imageSourceCollector.on('end', (collected) => {
    if (collected.size === 0) {
      console.log('انتهت مهلة اختيار مصدر الصورة');
    }
  });
}

async function handleImageSelection(interaction, imageUrl, responsibilities, message, client, customText = null, targetChannel = null) {
  try {
    // Build select menu options from responsibilities
    function buildMenuOptions() {
      const options = Object.keys(responsibilities).map(key => ({
        label: key,
        value: key
      }));

      if (options.length === 0) {
        options.push({
          label: 'No res',
          value: 'no_responsibilities',
          description: 'يرجى إضافة مسؤوليات أولاً'
        });
      }

      return options;
    }

    function createSelectMenu() {
      return new StringSelectMenuBuilder()
        .setCustomId('setup_select_responsibility')
        .setPlaceholder('اختر مسؤولية')
        .addOptions(buildMenuOptions());
    }

    const embed = colorManager.createEmbed()
      .setImage(imageUrl);

    // Add custom text if provided
    if (customText) {
      embed.setDescription(`**${customText}**`);
    }

    const row = new ActionRowBuilder().addComponents(createSelectMenu());
    let sentMessage;

    // Send to target channel if specified, otherwise reply normally
    if (targetChannel) {
      try {
        sentMessage = await targetChannel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: `**تم إرسال المنيو إلى ${targetChannel}**`, flags: 64 });
      } catch (error) {
        console.error('Failed to send to target channel:', error);
        await interaction.reply({ content: '**فشل في إرسال المنيو للروم المحدد!**', flags: 64 });
        return;
      }
    } else {
      if (interaction.update) {
        sentMessage = await interaction.update({ embeds: [embed], components: [newRow] });
      } else {
        sentMessage = await interaction.reply({ embeds: [embed], components: [row] });
      }
    }

    // Store the image URL for later use
    if (!client.setupImageData) {
      client.setupImageData = new Map();
    }
    client.setupImageData.set(message.author.id, imageUrl);

    // Function to update menu with current responsibilities
    async function updateMenu() {
      try {
        const newRow = new ActionRowBuilder().addComponents(createSelectMenu());
        if (sentMessage && sentMessage.edit) {
          await sentMessage.edit({ embeds: [embed], components: [newRow] });
        }
      } catch (error) {
        console.error('Failed to update menu:', error);
      }
    }

    // Function to update menu immediately
    async function updateMenuImmediately() {
      try {
        // Reload responsibilities from file to get latest data
        const fs = require('fs');
        const path = require('path');
        const responsibilitiesPath = path.join(__dirname, '..', 'data', 'responsibilities.json');
        
        let currentResponsibilities = {};
        try {
          const data = fs.readFileSync(responsibilitiesPath, 'utf8');
          currentResponsibilities = JSON.parse(data);
        } catch (error) {
          console.log('No responsibilities file found, using empty object');
        }
        
        // Update the buildMenuOptions function to use current data
        function buildCurrentMenuOptions() {
          const options = Object.keys(currentResponsibilities).map(key => ({
            label: key,
            value: key
          }));

          if (options.length === 0) {
            options.push({
              label: 'No res',
              value: 'no_responsibilities',
              description: 'يرجى إضافة مسؤوليات أولاً'
            });
          }

          return options;
        }

        function createCurrentSelectMenu() {
          return new StringSelectMenuBuilder()
            .setCustomId('setup_select_responsibility')
            .setPlaceholder('اختر مسؤولية')
            .addOptions(buildCurrentMenuOptions());
        }

        const newRow = new ActionRowBuilder().addComponents(createCurrentSelectMenu());
        if (sentMessage && sentMessage.edit) {
          await sentMessage.edit({ embeds: [embed], components: [newRow] });
        }
      } catch (error) {
        console.error('Failed to update menu immediately:', error);
      }
    }

    // Store updater function globally for external updates
    if (!client.setupMenuUpdaters) {
      client.setupMenuUpdaters = new Map();
    }
    client.setupMenuUpdaters.set(sentMessage.id, updateMenuImmediately);

    // Persistent collector for select menu - لا ينتهي أبداً إلا إذا تم حذف الرسالة
    const filter = i => i.customId === 'setup_select_responsibility';
    const collector = targetChannel ? targetChannel.createMessageComponentCollector({ filter }) : message.channel.createMessageComponentCollector({ filter });

		// تم إزالة زر الإلغاء

		collector.on('collect', async interaction => {
      try {
        // التحقق من صلاحية التفاعل
        if (!interaction || !interaction.isRepliable()) {
          console.log('تفاعل غير صالح في السيتب');
          return;
        }

        // منع التفاعلات المتكررة
        if (interaction.replied || interaction.deferred) {
          console.log('تم تجاهل تفاعل متكرر في السيتب');
          return;
        }

        const selected = interaction.values[0];

        if (selected === 'no_responsibilities') {
          return interaction.reply({ 
            content: '**لا توجد مسؤوليات معرفة حتى الآن. يرجى إضافة مسؤوليات أولاً.**', 
            flags: 64 
          });
        }

        // Reload current responsibilities data directly from file
        const fs = require('fs');
        const path = require('path');
        const responsibilitiesPath = path.join(__dirname, '..', 'data', 'responsibilities.json');
        
        let currentResponsibilities = {};
        try {
          const data = fs.readFileSync(responsibilitiesPath, 'utf8');
          currentResponsibilities = JSON.parse(data);
        } catch (error) {
          console.error('Failed to load responsibilities:', error);
          return interaction.reply({ content: '**خطأ في تحميل المسؤوليات!**', flags: 64 });
        }
        
        const responsibility = currentResponsibilities[selected];
        if (!responsibility) {
          // Update menu after failed selection
          await updateMenuImmediately();
          return interaction.reply({ content: '**المسؤولية غير موجودة!**', flags: 64 });
        }

        const desc = responsibility.description && responsibility.description.toLowerCase() !== 'لا'
          ? responsibility.description
          : '**No desc**';

        // Build buttons for each responsible with their nicknames
        const buttons = [];
        const responsiblesList = [];

        if (responsibility.responsibles && responsibility.responsibles.length > 0) {
          for (let i = 0; i < responsibility.responsibles.length; i++) {
            const userId = responsibility.responsibles[i];
            try {
              const member = await message.guild.members.fetch(userId);
              const displayName = member.displayName || member.user.username;
              responsiblesList.push(`${i + 1}. ${displayName}`);
              buttons.push(
                new ButtonBuilder()
                  .setCustomId(`setup_contact_${selected}_${userId}`)
                  .setLabel(`${i + 1}`)
                  .setStyle(ButtonStyle.Primary)
              );
            } catch (error) {
              console.error(`Failed to fetch member ${userId}:`, error);
              responsiblesList.push(`${i + 1}. مستخدم ${userId}`);
              buttons.push(
                new ButtonBuilder()
                  .setCustomId(`setup_contact_${selected}_${userId}`)
                  .setLabel(`${i + 1}`)
                  .setStyle(ButtonStyle.Primary)
              );
            }
          }
        }

        if (buttons.length > 0) {
          buttons.push(
            new ButtonBuilder()
              .setCustomId(`setup_contact_${selected}_all`)
              .setLabel('الكل')
              .setStyle(ButtonStyle.Success)
          );
        }

        // Create embed for the responsibility details with buttons
        const responseEmbed = colorManager.createEmbed()
          .setTitle(`استدعاء مسؤولي: ${selected}`)
          .setDescription(`**الشرح :** *${desc}*\n\n**المسؤولين المتاحين :**\n*${responsiblesList.join('\n')}*\n\n**اختر من تريد استدعائه:**`)
          .setThumbnail('https://cdn.discordapp.com/emojis/1303973825591115846.png?v=1');

        const actionRows = [];
        for (let i = 0; i < buttons.length; i += 5) {
          actionRows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
        }

        if (buttons.length === 0) {
          return interaction.reply({
            content: `**المسؤولية :** __${selected}__\n**الشرح :** *${desc}*\n**لا يوجد مسؤولين معينين لهذه المسؤولية !**`,
            flags: 64
          });
        }

        await interaction.reply({
          embeds: [responseEmbed],
          components: actionRows,
          flags: 64
        });

        // Handle button clicks for contacting responsibles
        const buttonCollector = message.channel.createMessageComponentCollector({ 
          filter: i => i.customId.startsWith('setup_contact_'),
          time: 300000
        });

        buttonCollector.on('collect', async buttonInteraction => {
          try {
            // التحقق من صلاحية التفاعل
            if (!buttonInteraction || !buttonInteraction.isRepliable()) {
              console.log('تفاعل غير صالح في أزرار السيتب');
              return;
            }

            // منع التفاعلات المتكررة
            if (buttonInteraction.replied || buttonInteraction.deferred) {
              console.log('تم تجاهل تفاعل متكرر في أزرار السيتب');
              return;
            }

            const parts = buttonInteraction.customId.split('_');
            const responsibilityName = parts[2];
            const target = parts[3]; // userId or 'all'

            // Check cooldown before showing modal
            const cooldownTime = checkCooldown(buttonInteraction.user.id, responsibilityName);
            if (cooldownTime > 0) {
              return safeReply(buttonInteraction, `**لقد استخدمت هذا الأمر مؤخرًا. يرجى الانتظار ${Math.ceil(cooldownTime / 1000)} ثانية أخرى.**`);
            }

            // Show modal to enter reason only
            const modal = new ModalBuilder()
              .setCustomId(`setup_reason_modal_${responsibilityName}_${target}_${Date.now()}`)
              .setTitle('call reason');

            const reasonInput = new TextInputBuilder()
              .setCustomId('reason')
              .setLabel('Reason')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setPlaceholder('اكتب سبب الحاجة للمسؤول...')
              .setMaxLength(1000);

            const reasonRow = new ActionRowBuilder().addComponents(reasonInput);
            modal.addComponents(reasonRow);

            await buttonInteraction.showModal(modal);
          } catch (error) {
            console.error('Error in button collector:', error);
            await safeReply(buttonInteraction, '**حدث خطأ أثناء معالجة الطلب.**');
          }
        });

		buttonCollector.on('end', collected => {
			// console.log(`Collected ${collected.size} interactions.`);
		});

      } catch (error) {
        console.error('Error in responsibility selection:', error);
        try {
          await interaction.reply({ 
            content: '**حدث خطأ أثناء معالجة الطلب.**', 
            flags: 64 
          });
        } catch (replyError) {
          console.error('Failed to send error reply:', replyError);
        }
      }
    });

	// تم إزالة معالج زر الإلغاء

	collector.on('end', collected => {
		// Disable components when collector ends
		try {
			const disabledRow = new ActionRowBuilder().addComponents(
				StringSelectMenuBuilder.from(createSelectMenu()).setDisabled(true)
			);
			if (sentMessage && sentMessage.edit) {
				sentMessage.edit({ components: [disabledRow] }).catch(() => {});
			}
		} catch (error) {
			console.error('Error disabling components:', error);
		}
	});

  } catch (error) {
    console.error('Error in handleImageSelection:', error);
    try {
      await interaction.reply({ 
        content: '**حدث خطأ أثناء معالجة الصورة.**', 
        flags: 64 
      });
    } catch (replyError) {
      console.error('Failed to send error reply:', replyError);
    }
  }
}

module.exports = { name, execute, updateAllSetupMenus };