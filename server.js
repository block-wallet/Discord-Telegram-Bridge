#!/usr/bin/env node
import './env.js';
import { discordWebhookClient } from './backends/discord.js';
import { telegram, telegramGetFileURL, telegramGetProfilePic } from './backends/telegram.js';

import { enable_heroku } from './utils/heroku.js';

if ("HEROKU_DYNO_URL" in process.env) {
	enable_heroku();
}

// import env variables
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

console.log("Telegram chat id: " + TELEGRAM_CHAT_ID);
console.log("Discord channel id: " + DISCORD_CHANNEL_ID);

// Telegram -> Discord handler
telegram.on("message", async (message) => {

	if (message.chat.id != TELEGRAM_CHAT_ID) {
		return;
	}

	// Ignore messages from bots
	if (message.from.is_bot) {
		return;
	}

	var username = `[TELEGRAM] ${message.from.first_name}`;
	if (message.from.last_name) {
		username += ` ${message.from.last_name}`;
	}
	if (message.from.username) {
		username += ` (@${message.from.username})`;
	}

	let profileUrl = await telegramGetProfilePic(message);

	var text;
	var fileId;

	if (!message.document && !message.photo && !message.sticker) {
		if (!message.text) {
			return;
		}
		text = message.text;

		// convert bold, italic & hyperlink Telegram text for Discord markdown
		if (message.entities) {
			text = convert_text_telegram_to_discord(text, message.entities);
		}

	} else {
		text = message.caption;

		// convert bold, italic & hyperlink Telegram text for Discord markdown
		if (message.caption_entities) {
			text = convert_text_telegram_to_discord(text, message.caption_entities);
		}

		if (message.document) {
			fileId = message.document.file_id;
		} else if (message.sticker) {
			fileId = message.sticker.file_id;
		} else if (message.photo) {
			// pick the last/largest picture in the list
			fileId = message.photo[message.photo.length - 1].file_id;
		}
	}

	if (text) {
		text = text.replace(/@everyone/g, "[EVERYONE]").replace(/@here/g, "[HERE]");
	}

	try {
		var fileUrl = "";
		if (fileId) {
			var file = await telegram.getFile(fileId);
			fileUrl = telegramGetFileURL(file.file_path);

			if (fileUrl != "") {
				discordWebhookClient.send(text, {
					username: username, avatarURL: profileUrl, files: [fileUrl]
				});
			}
		}
		if (!fileId || fileUrl == "") {
			await discordWebhookClient.send(text, {
				username: username, avatarURL: profileUrl
			});
		}
	}
	catch (err) {
		console.log(err.message);
		return;
	}
});

function convert_text_telegram_to_discord(text, entities) {
	var convert;
	var start_format;
	var end_format;
	var section_offset = 0
	var section_end;
	var section_start;

	entities.forEach(({ type, offset, length, url }) => {
		convert = true;
		if (type == 'bold') {
			start_format = '\*\*';
			end_format = '\*\*';
		} else if (type == 'italic') {
			start_format = '\_';
			end_format = '\_';
		} else if (type == 'text_link') {
			start_format = '\*\*';
			end_format = '\*\* (<' + url + '>)';
		} else {
			// Don't convert other entities
			convert = false;
		}

		if (convert) {
			section_start = offset + section_offset;
			section_end = offset + length + section_offset;
			// First add end_format, so it won't mess up the string indexes for start_format
			text = text.slice(0, section_end) + end_format + text.slice(section_end);
			text = text.slice(0, section_start) + start_format + text.slice(section_start);
			section_offset += start_format.length + end_format.length;
		}
	});

	return text
}