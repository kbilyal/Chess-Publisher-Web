import { FideRatingRepository } from './FideRatingRepository';
import { FideRatingService } from './FideRatingService';

export const fideRepository = new FideRatingRepository();
export const fideService = new FideRatingService(fideRepository);

export * from './types';
export * from './FideRatingRepository';
export * from './FideRatingService';
