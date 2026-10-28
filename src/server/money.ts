// Amounts on screen: ₹ with Indian grouping (₹1,21,102). The AI's facts keep "Rs 1,21,102" (pipeline/
// chunking/format.ts), because its numbers check reads them; text that comes from there is switched to ₹
// only when it is shown (toRupeeSign).
import { rupees, signedRupees } from '../pipeline/chunking/format';

/** '₹1,20,000', '-₹580' */
export const inr = (amount: number): string => rupees(amount).replace('Rs ', '₹');

/** '+₹1,200', '-₹580', '₹0' */
export const signedInr = (amount: number): string => signedRupees(amount).replace('Rs ', '₹');

/** 'Rs 14,000 put in' -> '₹14,000 put in', for AI text and facts already checked on the server. */
export const toRupeeSign = (text: string): string => text.replace(/Rs ?(?=\d)/g, '₹');
