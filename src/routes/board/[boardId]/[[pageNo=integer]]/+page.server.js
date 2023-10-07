import connectDB from '$lib/database/mongoosePriomise.js';
import { Article } from '$lib/models/article.js';

connectDB();
export const load = async ({ params }) => {
	console.log('[[pageNo=integer]]', params);

	// 한페이지에 보여주는 게시물
	const pageUnit = 30;

	let pageNo = params.pageNo || 1;

	try {
		const filter = { boardId: params.boardId, state: 'write' };

		const total = await Article.countDocuments(filter);

		console.debug('total', total);

		if (!total) {
			return { articles: [] };
		}

		const maxPage = parseInt(total / pageUnit + 1);

		//
		if (maxPage < pageNo) {
			pageNo = maxPage;
		}

		console.log(
			'pageNo',
			pageNo,
			'maxPage',
			maxPage,
			'(pageNo-1)*pageUnit)',
			(pageNo - 1) * pageUnit,
			pageNo * pageUnit
		);

		const articles = await Article.find(filter)
			.sort({ createdAt: -1 })
			.skip((pageNo - 1) * pageUnit)
			.limit(pageNo * pageUnit)
			.populate({
				path: 'comments',
				match: { state: 'write' },
				options: { sort: { createdAt: -1 } }
			})
			.exec();

		articles.forEach((article) => {
			const image = article.content.includes('<img src=');
			const youtube = article.content.includes('<div data-oembed-url=');

			article.content =
				(image ? '<i class="bi bi-card-image text-success px-2"></i>' : '') +
				(youtube ? '<i class="bi bi-youtube text-danger px-2"></i>' : '');
		});

		//console.log('articles', articles);

		return { pageNo, maxPage, articles: JSON.parse(JSON.stringify(articles)) };
	} catch (error) {
		console.error('[[pageNo=integer]]', error);
		throw error(500, '목록을 가져오는 중에 오류가 발생하였습니다.');
	}
};
