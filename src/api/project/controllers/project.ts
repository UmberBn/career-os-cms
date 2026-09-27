/**
 * project controller
 */

import { factories } from '@strapi/strapi';
import { projectPopulate } from '../../../utils/consumer-populate';

export default factories.createCoreController('api::project.project', () => ({
  async find(ctx) {
    ctx.query = {
      ...ctx.query,
      populate: projectPopulate,
    };

    return super.find(ctx);
  },

  async findOne(ctx) {
    ctx.query = {
      ...ctx.query,
      populate: projectPopulate,
    };

    return super.findOne(ctx);
  },
}));
