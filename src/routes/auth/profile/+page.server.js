import connectDB from '$lib/database/mongoosePriomise.js';
import { error } from '@sveltejs/kit';
import { User } from '$lib/models/user.js';

connectDB();
export const load = async ({ params, locals }) => {
  
  const session = await locals.getSession();
  
  if (!session?.user?.nickname) {
    throw error(405, {message: '로그인 해 주세요'});
  }
  
  const filter = { email: session.user.email, state:{$ne: 'banned'} };
  
  const projection = {nickname:1, introduction:1, photo:1}
  
  const profile = await  User.findOne(filter, projection);
  
  console.log('profile', profile)
  
  if (!profile) {
    throw error(410, { message: `회원 정보를 찾을 수 없습니다.` });
  }
  
  return {
    profile: JSON.parse(JSON.stringify(profile)),
  };
};
