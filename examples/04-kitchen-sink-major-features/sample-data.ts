/**
 * Sample review data
 */

import type { SectionData } from '../../src';

export const SAMPLE_REVIEWS: SectionData[] = [
	{
		content: 'Amazing product! Best purchase ever. The quality exceeded my expectations and shipping was incredibly fast. Highly recommend to everyone!',
		metadata: { id: 1, source: 'verified_purchase' }
	},
	{
		content: 'Terrible quality. Broke after just 2 days of use. Very disappointed and customer service was unhelpful. Would not recommend.',
		metadata: { id: 2, source: 'verified_purchase' }
	},
	{
		content: 'It works fine. Does what it says on the box. Nothing special, but nothing terrible either. Average product.',
		metadata: { id: 3, source: 'verified_purchase' }
	},
	{
		content: 'Absolutely love it! Exceeded all my expectations. The build quality is fantastic and it looks even better in person!',
		metadata: { id: 4, source: 'verified_purchase' }
	},
	{
		content: 'Not worth the money at all. Poor build quality and misleading product description. Save your money.',
		metadata: { id: 5, source: 'verified_purchase' }
	},
	{
		content: 'BUY NOW!!! CLICK HERE spam spam spam amazing deals!!!',
		metadata: { id: 6, source: 'unverified' }
	},
];