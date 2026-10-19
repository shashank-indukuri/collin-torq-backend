/** Reviewed OEM service-brand relationship. It establishes identifier equivalence,
 * not installed-equipment compatibility, supersession, or generic alternatives. */
export const source1YorkEvidence='https://www.johnsoncontrols.com/Services-and-Support/Replacement-Parts-and-Supplies/Residential-and-Light-Commercial-Parts';
export function source1YorkIdentity(supplier:string,observedBrand:string,observedNumber:string,requestedBrand?:string,requestedNumber?:string){
 const normalize=(v:string)=>v.toUpperCase().replace(/[\s-]/g,'');
 return supplier==='johnstone'&&requestedBrand?.trim().toLowerCase()==='york'&&/^source\s*1$/i.test(observedBrand.trim())&&(/^S1\d{11}$/.test(normalize(observedNumber))||normalize(observedNumber)==='S1CAP4405040DR')&&Boolean(requestedNumber)&&normalize(observedNumber)===normalize(requestedNumber!);
}
