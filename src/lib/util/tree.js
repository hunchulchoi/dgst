export default function convertToTree(array){
  
  const filtered = array.filter(el=> el.state === 'write'
    || (el.state!=='write' && array.find(eel=>eel.parentCommentId === el.id)))
  
  const cloned = filtered.filter(el=>el.depth===1)
  
  filtered.map(el=>{
    if(el.state!=='write'){
      el.content = '삭제 되었습니다.';
      delete el.image;
    }
  });
  
  const maxDepth = Math.max(...filtered.map(e=>e.depth));
  
  for(let i=2; i<=maxDepth; i++){
    const depth = filtered.filter(el=>el.depth===i).reverse();
    
    depth.forEach(el=>{
      const parentId = el.parentCommentId;
      const parent = cloned.findIndex(p=>p.id === parentId);
      
      cloned.splice(parent+1, 0, el);
    })
  }
  
  
 /* for(var i=cloned.length-1; i>-1; i--){
    var parentId = cloned[i][parentIdFieldName];
    
    if(parentId){
      var filtered = array.filter((elem)=> elem[idFieldName] === parentId);
      
      //console.log('filtered', filtered);
      
      if(filtered.length){
        var parent = filtered[0];
        
        if(parent[childrenFieldName]){
          parent[childrenFieldName].push(cloned[i]);
        }
        else {
          parent[childrenFieldName] = [cloned[i]];
        }
      }
      cloned.splice(i,1);
    }
  }*/
  
  return cloned;
}

