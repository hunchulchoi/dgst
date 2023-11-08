import {error} from "@sveltejs/kit";
import {Alarm} from '$lib/models/alarm.js';
import connectDB from "$lib/database/mongoosePriomise.js";

connectDB();

export const load = async ({locals})=>{

  const session = await locals.getSession();

  // 로그인 안한 경우
  if(!session || !session.user || !session.user.nickname){
    throw error(405, {message: '로그인이 필요합니다.'});
  }

  let alarms = await Alarm.find({email: session.user.email, createdAt: {$gt: new Date(new Date()-1000*60*60*24*3)}})
    .select('boardId articleId title comments updatedAt comment commentContent readAt')
      .sort({updatedAt: -1})
    .limit(30);


  if(alarms && alarms.length){
      alarms = JSON.parse(JSON.stringify(alarms));
  }

  return{
    alarms,
  }
}
