import { Article } from '$lib/models/article.js';
import { User } from '$lib/models/user.js';

const THIRTY_MIN_AGO = () => new Date(Date.now() - 30 * 60 * 1000);

/**
 * 게시판 목록용 경량 조회 (본문 HTML·comments populate 없음)
 *
 * @param {object} params
 * @param {import('mongoose').FilterQuery<object>} params.filter
 * @param {number} params.pageNo
 * @param {number} params.pageUnit
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchBoardArticleList({ filter, pageNo, pageUnit }) {
  const skip = (pageNo - 1) * pageUnit;
  const thirtyMinAgo = THIRTY_MIN_AGO();

  const rows = await Article.aggregate([
    { $match: filter },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: pageUnit },
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
        content: {
          $concat: [
            {
              $cond: [
                { $regexMatch: { input: { $ifNull: ['$content', ''] }, regex: '<img ' } },
                '<i class="bi bi-card-image text-success px-2"></i>',
                ''
              ]
            },
            {
              $cond: [
                { $regexMatch: { input: { $ifNull: ['$content', ''] }, regex: '<video ' } },
                '<i class="bi bi-camera-video text-primary px-2"></i>',
                ''
              ]
            },
            {
              $cond: [
                {
                  $or: [
                    {
                      $regexMatch: {
                        input: { $ifNull: ['$content', ''] },
                        regex: 'youtube\\.com'
                      }
                    },
                    {
                      $regexMatch: { input: { $ifNull: ['$content', ''] }, regex: 'youtu\\.be' }
                    },
                    {
                      $regexMatch: {
                        input: { $ifNull: ['$content', ''] },
                        regex: 'youtube\\.com/embed'
                      }
                    }
                  ]
                },
                '<i class="bi bi-youtube text-danger px-2"></i>',
                ''
              ]
            },
            {
              $cond: [
                {
                  $or: [
                    {
                      $regexMatch: {
                        input: { $ifNull: ['$content', ''] },
                        regex: 'instagram\\.com'
                      }
                    },
                    {
                      $regexMatch: {
                        input: { $ifNull: ['$content', ''] },
                        regex: 'blockquote class="instagram-media"'
                      }
                    }
                  ]
                },
                '<i class="bi bi-instagram text-warning px-2"></i>',
                ''
              ]
            }
          ]
        }
      }
    }
  ]).exec();

  const jsonArticles = JSON.parse(JSON.stringify(rows));
  const emails = [...new Set(jsonArticles.map((a) => a.email))];

  if (emails.length === 0) {
    return jsonArticles;
  }

  const users = await User.find({ email: { $in: emails } }, { email: 1, photo: 1 }).lean();
  const userPhotoMap = users.reduce((acc, user) => {
    acc[user.email] = user.photo;
    return acc;
  }, /** @type {Record<string, string | undefined>} */ ({}));

  jsonArticles.forEach((article) => {
    article.photo = userPhotoMap[article.email];
  });

  return jsonArticles;
}
