/**
 * experience controller
 */

import { factories } from '@strapi/strapi';
import { experiencePopulate } from '../../../utils/consumer-populate';

export default factories.createCoreController(
  'api::experience.experience',
  () => ({
    async find(ctx) {
      ctx.query = {
        ...ctx.query,
        populate: experiencePopulate,
      };

      return super.find(ctx);
    },

    async findOne(ctx) {
      ctx.query = {
        ...ctx.query,
        populate: experiencePopulate,
      };

      return super.findOne(ctx);
    },
  })
);
