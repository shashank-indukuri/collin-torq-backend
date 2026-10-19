/** Pure, dependency-free parser shared by Node and the bounded recovery verifier. */
export function catalogIdentity(body:string,supplier:string):{manufacturer:string;partNumber:string;supplierSku:string;description:string}|null{
 if(supplier==='johnstone'){
  const primary=body.split(/\nSubstitutions\s*\n/)[0]!;
  const partNumber=primary.match(/Mfg\.\s*#:\s*([^\n]+)/i)?.[1]?.trim();const manufacturer=primary.match(/Brand:\s*([^\n]+)/i)?.[1]?.trim();
  const supplierSku=primary.match(/Order\s*#:\s*([^\n]+)/i)?.[1]?.trim();const description=primary.match(/Description:\s*([^\n]+)/i)?.[1]?.trim();
  return partNumber&&manufacturer&&supplierSku&&description?{manufacturer,partNumber,supplierSku,description}:null;
 }
 if(supplier==='partstown'){
  const primary=body.split(/FREQUENTLY BOUGHT TOGETHER|ALSO OF INTEREST/i)[0]!;
  const manufacturer=primary.match(/Manufacturer:\s*([^\n\r]+)/i)?.[1]?.trim();const partNumber=primary.match(/Manufacturer #:\s*([^\n\r]+)/i)?.[1]?.trim();
  if(!manufacturer||!partNumber)return null;
  const description=primary.split('\n').map(l=>l.trim()).find(l=>l.toUpperCase().replace(/[\s-]/g,'').startsWith(manufacturer.toUpperCase().replace(/[\s-]/g,''))&&l.toUpperCase().replace(/[\s-]/g,'').includes(partNumber.toUpperCase().replace(/[\s-]/g,'')));
  const supplierSku=primary.match(/Parts Town #:\s*([^\n\r]+)/i)?.[1]?.trim()??'';
  return description?{manufacturer,partNumber,supplierSku,description}:null;
 }
 if(supplier==='grainger'){
  const primary=body.split(/Customers Also Purchased|Customers Also Viewed/i)[0]!;
  const model=primary.match(/Item\s*([A-Z0-9]+)\s*Mfr\.\s*Model\s*([^\n]+)/i);
  const manufacturer=primary.match(/Brand\s*(TITAN HD|TITAN PRO|DAYTON|YORK)(?=\s|Country|Housing|Operating|Voltage|Capacitance|Manufacturer|Overall|Product|Frequency|$)/i)?.[1]?.trim()??primary.match(/Brand\s*([^\n]+?)\s*Country of Origin/i)?.[1]?.trim();
  const description=primary.split('\n').map(t=>t.trim()).find(t=>t.startsWith((manufacturer??'')+' '));
  return model&&manufacturer&&description?.startsWith(manufacturer+' ')?{manufacturer,partNumber:model[2]!.trim(),supplierSku:model[1]!,description}:null;
 }
 return null;
}
export function productIdentityScript(host:string,partNumber:string,manufacturer?:string){
 const supplier=host==='www.johnstonesupply.com'?'johnstone':host==='www.partstown.com'?'partstown':host==='www.grainger.com'?'grainger':undefined;
 if(!supplier)throw new Error('No reviewed recovery identity verifier for this supplier');
 return `() => {
 const parse=${catalogIdentity.toString()};
 const raw=parse(document.body?.innerText??'',${JSON.stringify(supplier)});
 const wanted=${JSON.stringify(partNumber.toUpperCase().replace(/[\s-]/g,''))};const brand=${JSON.stringify(manufacturer?.trim().toLowerCase()??'')};
 const number=raw?.partNumber.toUpperCase().replace(/[\\s-]/g,'');
 const observed=raw?.manufacturer.trim().toLowerCase();
 const service=${JSON.stringify(supplier)}==='johnstone'&&brand==='york'&&/^source\\s*1$/i.test(observed??'')&&(/^S1\\d{11}$/.test(number??'')||number==='S1CAP4405040DR');
 return {matched:Boolean(raw&&number===wanted&&(!brand||observed===brand||service)),manufacturer:raw?.manufacturer??null,partNumber:raw?.partNumber??null};
 }`;
}
