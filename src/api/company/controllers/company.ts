/**
 * company controller
 */

import { factories } from '@strapi/strapi';
import { companyPopulate } from '../../../utils/consumer-populate';

export default factories.createCoreController('api::company.company', () => ({
  async find(ctx) {
    ctx.query = {
      ...ctx.query,
      populate: companyPopulate,
    };

    return super.find(ctx);
  },

  async findOne(ctx) {
    ctx.query = {
      ...ctx.query,
      populate: companyPopulate,
    };

    return super.findOne(ctx);
  },
}));
