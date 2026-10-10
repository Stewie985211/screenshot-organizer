// Windows DIB / BITMAPINFOHEADER decoding for ordinary screenshot BMP files.
// Supports uncompressed 1/4/8/16/24/32-bit and 16/32-bit BI_BITFIELDS.
export function decodeBmp(buffer:Buffer):{width:number;height:number;data:Buffer}{
  if(buffer.length<54||buffer.toString('ascii',0,2)!=='BM')throw new Error('BMP 文件头无效');
  const offset=buffer.readUInt32LE(10),headerSize=buffer.readUInt32LE(14);
  if(headerSize<40||14+headerSize>buffer.length)throw new Error('不支持此 BMP 文件头');
  const width=buffer.readInt32LE(18),signedHeight=buffer.readInt32LE(22),height=Math.abs(signedHeight),bits=buffer.readUInt16LE(28),compression=buffer.readUInt32LE(30);
  if(width<=0||height<=0||width*height>40_000_000||buffer.readUInt16LE(26)!==1)throw new Error('BMP 尺寸或图像平面无效');
  if(![1,4,8,16,24,32].includes(bits)||!(compression===0||(compression===3&&[16,32].includes(bits))))throw new Error('暂不支持此 BMP 压缩格式');
  const stride=Math.ceil(width*bits/32)*4;
  if(offset<14+headerSize||offset+stride*height>buffer.length)throw new Error('BMP 像素数据不完整');
  const paletteCount=bits<=8?(buffer.readUInt32LE(46)||2**bits):0;
  const paletteOffset=14+headerSize;
  if(paletteCount>2**bits||paletteOffset+paletteCount*4>offset)throw new Error('BMP 调色板无效');
  let masks=bits===16?[0x7c00,0x03e0,0x001f]:[0xff0000,0x00ff00,0x0000ff];
  if(compression===3){const maskOffset=14+40;if(maskOffset+12>offset)throw new Error('BMP 颜色掩码缺失');masks=[0,1,2].map(i=>buffer.readUInt32LE(maskOffset+i*4));}
  const shifts=masks.map(mask=>{let shift=0;while(shift<32&&((mask>>>shift)&1)===0)shift++;if(shift===32)throw new Error('BMP 颜色掩码无效');return shift;});
  const rgb=Buffer.alloc(width*height*3);
  for(let y=0;y<height;y++){
    const row=offset+(signedHeight>0?height-1-y:y)*stride;
    for(let x=0;x<width;x++){
      const destination=(y*width+x)*3;
      if(bits<=8){const index=bits===8?buffer[row+x]:bits===4?(buffer[row+(x>>1)]>>(x%2===0?4:0))&15:(buffer[row+(x>>3)]>>(7-x%8))&1;if(index>=paletteCount)throw new Error('BMP 调色板索引无效');const color=paletteOffset+index*4;rgb[destination]=buffer[color+2];rgb[destination+1]=buffer[color+1];rgb[destination+2]=buffer[color];}
      else if(bits===24){const color=row+x*3;rgb[destination]=buffer[color+2];rgb[destination+1]=buffer[color+1];rgb[destination+2]=buffer[color];}
      else{const color=bits===16?buffer.readUInt16LE(row+x*2):buffer.readUInt32LE(row+x*4);for(let channel=0;channel<3;channel++){const mask=masks[channel];rgb[destination+channel]=Math.round((((color&mask)>>>0)>>>shifts[channel])/(mask>>>shifts[channel])*255);}}
    }
  }
  return{width,height,data:rgb};
}
