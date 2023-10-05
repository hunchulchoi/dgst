import { json } from '@sveltejs/kit';
import connectDB from '$lib/database/mongoosePriomise.js';
import { write } from '$lib/util/fileUpload.js';

import { User } from '$lib/models/user.js';

connectDB();

export async function PATCH({ request, locals }) {
	const session = await locals.getSession();

	const formData = await request.formData();

	console.debug('formData', formData, 'session', session);

	console.debug(
		'photo222',
		formData.get('photo'),
		formData.get('photo') === 'undefined',
		formData.get('photo') === undefined
	);

	//파일 저장
	let storeFileName;

	if (formData.get('photo')?.size) {
		storeFileName = await write(formData.get('photo'), 'profiles');

		if (!storeFileName) return new Response('파일 저장에 실패 하였습니다.', { status: 500 });
	}

	const filter = {
		email: session.user.email,
		state: 'signup'
	};

	const update = {
		nickname: formData.get('nickname'),
		introduction: formData.get('introduction'),
		photo: storeFileName,
		state: 'registered',
		last_modified: new Date()
	};

	console.debug('filter', filter, 'update', update);

	try {
		const registeredUser = await User.findOneAndUpdate(filter, update, { new: true });

		console.debug('registeredUser', registeredUser);

		session.user.email = registeredUser.email;
		session.user.nickname = registeredUser.nickname;
		session.user.introduction = registeredUser.introduction;
		session.user.photo = registeredUser.photo;

		console.log('session', session);

		return json({ nickname: registeredUser.nickname, photo: registeredUser.photo });
	} catch (error) {
		console.error(error);

		return new Response('저장에 실패 하였다.', { status: 500 });
	}
}
