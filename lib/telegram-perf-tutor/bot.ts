import { Markup, Telegraf } from 'telegraf';
import type { Context } from 'telegraf';
import {
  adaptLevel,
  createLearner,
  getLearner,
  mergeTags,
  resetLearner,
  saveLearner,
} from './learner-store';
import { levelLabel, TOPICS } from './topics';
import { generateHint, generateQuestion, gradeAnswer } from './tutor-ai';
import type { LearnerProfile, TopicId } from './types';

const TG_MAX = 3900;

function allowedUserIds(): Set<number> | null {
  const raw = process.env.TELEGRAM_ALLOWED_USER_IDS?.trim();
  if (!raw) return null;
  const ids = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return ids.length ? new Set(ids) : null;
}

async function sendLong(ctx: Context, text: string) {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > TG_MAX) {
    let cut = rest.lastIndexOf('\n\n', TG_MAX);
    if (cut < TG_MAX * 0.5) cut = rest.lastIndexOf('\n', TG_MAX);
    if (cut < TG_MAX * 0.5) cut = TG_MAX;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  for (const chunk of chunks) {
    await ctx.reply(chunk);
  }
}

async function ensureProfile(ctx: Context): Promise<LearnerProfile> {
  const id = ctx.from!.id;
  const name = ctx.from?.first_name || ctx.from?.username || `User ${id}`;
  return (await getLearner(id)) ?? (await createLearner(id, name));
}

function statusCard(p: LearnerProfile): string {
  const label = levelLabel(p.level);
  const pending = p.pending ? `\nOpen question: yes` : '';
  return (
    `📊 Your tutor profile\n` +
    `Level: ${p.level}/10 (${label})\n` +
    `Answered: ${p.totalAnswered}\n` +
    `Strengths: ${p.strengths.slice(-5).join(', ') || 'still learning'}\n` +
    `Focus areas: ${p.weaknesses.slice(-5).join(', ') || 'none yet'}` +
    pending
  );
}

async function askNext(ctx: Context) {
  const profile = await ensureProfile(ctx);
  await ctx.reply('🧠 Crafting a question for your level…');
  const q = await generateQuestion(profile);
  profile.pending = q;
  if (!profile.topicsSeen.includes(q.topic)) {
    profile.topicsSeen.push(q.topic);
  }
  await saveLearner(profile);

  const topicTitle = TOPICS.find((t) => t.id === q.topic)?.title || q.topic;
  await ctx.reply(
    `❓ Question (L${q.difficulty} · ${topicTitle})\n\n${q.question}\n\n` +
      `Reply with your answer as a normal message.\n` +
      `Commands: /hint · /skip · /level · /curriculum`,
    Markup.keyboard([
      ['/hint', '/skip'],
      ['/level', '/next'],
    ]).resize(),
  );
}

/** Shared Telegraf bot used by Vercel webhook and optional local polling. */
export function createPerfTutorBot(): Telegraf {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN');
  }

  const bot = new Telegraf(token);
  const allow = allowedUserIds();

  bot.use(async (ctx, next) => {
    if (!allow) return next();
    const id = ctx.from?.id;
    if (!id || !allow.has(id)) {
      if (ctx.chat) {
        await ctx.reply('This tutor bot is private. Your Telegram user id is not allowed.');
      }
      return;
    }
    return next();
  });

  bot.start(async (ctx) => {
    const profile = await ensureProfile(ctx);
    await ctx.reply(
      `Hey ${profile.displayName}! 👋\n\n` +
        `I'm your live Performance Testing & Engineering tutor.\n\n` +
        `I'll start from the basics, learn how strong you are from your answers, ` +
        `then raise or lower difficulty automatically.\n\n` +
        `Each round: you answer → I grade you → I give a detailed model answer + takeaways.\n\n` +
        `This bot stays online in the cloud — your laptop can be off.\n\n` +
        statusCard(profile),
    );
    await askNext(ctx);
  });

  bot.command('level', async (ctx) => {
    const profile = await ensureProfile(ctx);
    await ctx.reply(statusCard(profile));
  });

  bot.command('curriculum', async (ctx) => {
    const lines = TOPICS.map((t) => `• L${t.minLevel}+ — ${t.title}: ${t.blurb}`).join('\n');
    await sendLong(
      ctx,
      `📚 Curriculum (topics unlock as your level rises):\n\n${lines}\n\nUse /level to see where you are.`,
    );
  });

  bot.command('next', async (ctx) => {
    const profile = await ensureProfile(ctx);
    if (profile.pending) {
      await ctx.reply('You still have an open question. Answer it, or /skip to get a new one.');
      await ctx.reply(`❓ ${profile.pending.question}`);
      return;
    }
    await askNext(ctx);
  });

  bot.command('skip', async (ctx) => {
    const profile = await ensureProfile(ctx);
    profile.pending = null;
    await saveLearner(profile);
    await ctx.reply('Skipped. Next question coming up…');
    await askNext(ctx);
  });

  bot.command('hint', async (ctx) => {
    const profile = await ensureProfile(ctx);
    if (!profile.pending) {
      await ctx.reply('No open question. Use /next or /start.');
      return;
    }
    await ctx.reply('💡 Thinking of a hint…');
    const hint = await generateHint(profile, profile.pending);
    await sendLong(ctx, `💡 Hint (not the full answer):\n\n${hint}`);
  });

  bot.command('reset', async (ctx) => {
    const name = ctx.from?.first_name || ctx.from?.username || `User ${ctx.from!.id}`;
    await resetLearner(ctx.from!.id, name);
    await ctx.reply('Progress wiped. Starting again at level 1…');
    await askNext(ctx);
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `Commands:\n` +
        `/start — begin / resume tutor\n` +
        `/next — next question\n` +
        `/hint — nudge without full answer\n` +
        `/skip — skip current question\n` +
        `/level — your adaptive level + strengths\n` +
        `/curriculum — topic map\n` +
        `/reset — wipe progress\n\n` +
        `Just type your answer as a normal chat message.`,
    );
  });

  bot.on('text', async (ctx) => {
    const text = ctx.message.text?.trim() || '';
    if (text.startsWith('/')) return;

    const profile = await ensureProfile(ctx);
    if (!profile.pending) {
      await ctx.reply('No open question right now. Use /next to get one.');
      return;
    }

    const pending = profile.pending;
    await ctx.reply('📝 Grading your answer and preparing a detailed explanation…');

    try {
      const grade = await gradeAnswer(profile, pending, text);

      profile.totalAnswered += 1;
      profile.strengths = mergeTags(profile.strengths, grade.detectedStrengths);
      profile.weaknesses = mergeTags(profile.weaknesses, grade.detectedWeaknesses);
      profile.notes = [profile.notes, grade.suggestedFocus].filter(Boolean).join(' | ').slice(-500);

      const prevTopicScore = profile.topicScores[pending.topic as TopicId] ?? grade.score;
      profile.topicScores[pending.topic as TopicId] = Math.round(
        prevTopicScore * 0.4 + grade.score * 0.6,
      );

      const oldLevel = profile.level;
      const newLevel = adaptLevel(profile, grade.score, grade.verdict);

      profile.history.push({
        questionId: pending.id,
        topic: pending.topic,
        difficulty: pending.difficulty,
        question: pending.question,
        userAnswer: text.slice(0, 2000),
        score: grade.score,
        verdict: grade.verdict,
        feedbackSummary: grade.whatWasGood.slice(0, 240),
        answeredAt: new Date().toISOString(),
      });
      profile.pending = null;
      await saveLearner(profile);

      const levelNote =
        newLevel > oldLevel
          ? `\n⬆️ Level up! Now ${newLevel}/10 (${levelLabel(newLevel)})`
          : newLevel < oldLevel
            ? `\n⬇️ Eased difficulty to ${newLevel}/10 (${levelLabel(newLevel)}) so we can rebuild foundations.`
            : `\nLevel stays ${newLevel}/10 (${levelLabel(newLevel)}).`;

      const takeaways =
        grade.keyTakeaways.length > 0
          ? `\n\n🔑 Key takeaways\n${grade.keyTakeaways.map((t) => `• ${t}`).join('\n')}`
          : '';

      await sendLong(
        ctx,
        `✅ Score: ${grade.score}/100 (${grade.verdict})${levelNote}\n\n` +
          `👍 What you got right:\n${grade.whatWasGood || '—'}\n\n` +
          `🔧 Gaps:\n${grade.gaps || '—'}\n\n` +
          `📖 Detailed answer\n${grade.detailedAnswer}` +
          takeaways +
          `\n\n🎯 Next focus: ${grade.suggestedFocus || 'Keep practicing.'}\n\n` +
          `Send /next for another question.`,
      );
    } catch (err) {
      console.error(err);
      await ctx.reply(
        `Sorry — grading failed (${err instanceof Error ? err.message : 'unknown error'}). ` +
          `Your question is still open; try answering again in a moment.`,
      );
    }
  });

  bot.catch((err) => {
    console.error('Bot error:', err);
  });

  return bot;
}

let cachedBot: Telegraf | null = null;

export function getPerfTutorBot(): Telegraf {
  if (!cachedBot) cachedBot = createPerfTutorBot();
  return cachedBot;
}
