// USPS state abbreviations, independent of supplier markup or navigation.
const states:Record<string,string>=Object.fromEntries('AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming'.split('|').map(entry=>entry.split(':')));
export function originStateValues(address:string){
 const suffix=address.match(/(?:^|[\s,])([a-z ]+?)\s+\d{5}(?:-\d{4})?\s*$/i)?.[1]?.trim();
 if(!suffix)return [];
 const upper=suffix.toUpperCase();
 const entries=Object.entries(states);
 const match=entries.find(([code])=>upper===code||upper.endsWith(' '+code))??entries.sort((a,b)=>b[1]!.length-a[1]!.length).find(([,name])=>suffix.toLowerCase()===name!.toLowerCase()||suffix.toLowerCase().endsWith(' '+name!.toLowerCase()));
 return match?[match[0],match[1]!]:[];
}
