import { redirect } from '@sveltejs/kit';
import { goto } from '$app/navigation';
import { onMount } from 'svelte';
import { browser } from '$app/environment';
import {Alarm} from "$lib/models/alarm.js";

export const load = async (event) => {
  const session = await event.locals.getSession();
  
  let alarms;
  
  // 알림이 있는 지 확인
  if(session?.user?.nickname){
    alarms = await Alarm.find({email: session.user.email})
      .sort({createdAt: 1})
      .select('articleId title email')
      .lean();
    
    alarms = JSON.parse(JSON.stringify(alarms))
  }
  
  

  return {
    session,
    alarms ,
  };
};
