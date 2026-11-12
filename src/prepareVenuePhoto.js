export async function prepareVenuePhoto(file) {
  if(!file || file.size>20971520)throw Error('Оберіть зображення розміром до 20 МБ.')
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Оберіть фото у форматі JPG, PNG або WebP.')
  const url=URL.createObjectURL(file)
  try {
    const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Не вдалося відкрити фото. Спробуйте JPG або PNG.'));img.src=url})
    const ratio=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight))
    const canvas=document.createElement('canvas')
    canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio))
    const context=canvas.getContext('2d')
    if(!context)throw Error('Пристрій не зміг підготувати фото.')
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height)
    for(const quality of [.84,.7,.55]) {
      const blob=await new Promise((resolve)=>canvas.toBlob(resolve,'image/jpeg',quality))
      if(blob && blob.size<=2097152)return blob
    }
    throw Error('Фото завелике після обробки. Оберіть менше зображення.')
  }finally{URL.revokeObjectURL(url)}
}
