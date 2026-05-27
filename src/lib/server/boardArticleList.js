import { Article } from '$lib/models/article.js';
import { Comment } from '$lib/models/comment.js';
import { User } from '$lib/models/user.js';

const THIRTY_MIN_MS = 30 * 60 * 1000;

/** @param {unknown} content */
function contentField(content) {
  return { $ifNull: [content, ''] };
}

/**
 * @param {unknown} contentExpr
 * @param {string} needle
 */
function contentContains(contentExpr, needle) {
  return { $gte: [{ $indexOfBytes: [contentField(contentExpr), needle] }, 0] };
}

/**
 * @param {unknown} contentExpr
 * @param {string[]} needles
 */
function contentContainsAny(contentExpr, needles) {
  return {
    $or: needles.map((needle) => contentContains(contentExpr, needle))
  };
}

const ARTICLE_PROJECTION = {
  $project: {
    _id: { $toString: '$_id' },
    title: 1,
    createdAt: 1,
    nickname: 1,
    email: 1,
    read: { $size: { $ifNull: ['$reads', []] } },
    like: { $size: { $ifNull: ['$likes', []] } },
    comment: { $size: { $ifNull: ['$comments', []] } },
    content: {
      $concat: [
        {
          $cond: [
            contentContains('$content', '<img '),
            '<i class="bi bi-card-image text-success px-2"></i>',
            ''
          ]
        },
        {
          $cond: [
            contentContains('$content', '<video '),
            '<i class="bi bi-camera-video text-primary px-2"></i>',
            ''
          ]
        },
        {
          $cond: [
            contentContainsAny('$content', ['youtube.com', 'youtu.be', 'youtube.com/embed']),
            '<i class="bi bi-youtube text-danger px-2"></i>',
            ''
          ]
        },
        {
          $cond: [
            contentContainsAny('$content', [
              'instagram.com',
              'blockquote class="instagram-media"'
            ]),
            '<i class="bi bi-instagram text-warning px-2"></i>',
            ''
          ]
        }
      ]
    }
  }
};

/**
 * 게시판 목록 + 최신 댓글 시각/유저 photo (분리 쿼리, 인덱스 친화)
 *
 * @param {object} params
 * @param {import('mongoose').FilterQuery<object>} params.filter
 * @param {number} params.pageNo
 * @param {number} params.pageUnit
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchBoardArticleList({ filter, pageNo, pageUnit }) {
  const skip = (pageNo - 1) * pageUnit;

  const articles = await Article.aggregate([
    { $match: filter },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: pageUnit },
    ARTICLE_PROJECTION
  ]).exec();

  if (articles.length === 0) return articles;

  const articleIds = articles.map((a) => a._id);
  const emails = [...new Set(articles.map((a) => a.email))];
  const newCommentThreshold = new Date(Date.now() - THIRTY_MIN_MS);

  const [latestComments, users] = await Promise.all([
    Comment.aggregate([
      { $match: { articleId: { $in: articleIds }, state: 'write' } },
      { $sort: { articleId: 1, createdAt: -1 } },
      { $group: { _id: '$articleId', latestAt: { $first: '$createdAt' } } }
    ]).exec(),
    User.find({ email: { $in: emails } }, { email: 1, photo: 1 }).lean().exec()
  ]);

  /** @type {Record<string, Date>} */
  const latestByArticle = {};
  for (const row of latestComments) {
    latestByArticle[row._id] = row.latestAt;
  }

  /** @type {Record<string, string | undefined>} */
  const photoByEmail = {};
  for (const u of users) {
    photoByEmail[u.email] = u.photo;
  }

  for (const a of articles) {
    const latest = latestByArticle[a._id];
    a.isNewComment = Boolean(latest && latest >= newCommentThreshold);
    a.photo = photoByEmail[a.email];
    a.createdAt = a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt;
  }

  return articles;
}
