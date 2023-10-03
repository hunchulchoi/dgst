import { json } from "@sveltejs/kit";

import {write} from "$lib/util/fileUpload.js";

export async function POST({request}) {
  console.log('upload.server POST', request);
  
  const data = await request.formData();
  
  console.log('body', data.get('upload').name)
  
  const res = await write(data.get('upload'), 'jjal');
  
  return json({url: res});
}
