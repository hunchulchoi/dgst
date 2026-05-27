import { Article } from '$lib/models/article.js';

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

/**
 * @param {Date} thirtyMinAgo
 * @returns {object[]}
 */
function buildListRowStages(thirtyMinAgo) {
  return [
    {
      $lookup: {
        from: 'comments',
        let: { commentIds: { $ifNull: ['$comments', []] } },
        pipeline: [
          { $match: { $expr: { $in: ['$_id', '$$commentIds'] } } },
          { $sort: { createdAt: -1 } },
          { $limit: 1 },
          { $project: { createdAt: 1 } }
        ],
        as: '_latestComment'
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'email',
        foreignField: 'email',
        pipeline: [{ $project: { photo: 1, _id: 0 } }],
        as: '_user'
      }
    },
    {
      $project: {
        title: 1,
        createdAt: 1,
        nickname: 1,
        email: 1,
        read: { $size: { $ifNull: ['$reads', []] } },
        like: { $size: { $ifNull: ['$likes', []] } },
        comment: { $size: { $ifNull: ['$comments', []] } },
        isNewComment: {
          $gte: [{ $arrayElemAt: ['$_latestComment.createdAt', 0] }, thirtyMinAgo]
        },
        photo: { $arrayElemAt: ['$_user.photo', 0] },
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
    }
  ];
}

/**
 * 게시판 목록 조회 (users lookup 포함 단일 aggregate)
 *
 * @param {object} params
 * @param {import('mongoose').FilterQuery<object>} params.filter
 * @param {number} params.pageNo
 * @param {number} params.pageUnit
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchBoardArticleList({ filter, pageNo, pageUnit }) {
  const skip = (pageNo - 1) * pageUnit;
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

  const rows = await Article.aggregate([
    { $match: filter },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: pageUnit },
    ...buildListRowStages(thirtyMinAgo)
  ]).exec();

  return JSON.parse(JSON.stringify(rows));
}
