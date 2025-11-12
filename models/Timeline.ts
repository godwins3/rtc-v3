import mongoose, { Schema, Document } from 'mongoose';

export interface ITimeline extends Document {
  uniqueId: string;
  projectName: string;
  clientName: string;
  schedulingMethod: 'backward' | 'forward';
  startDate?: Date;
  endDate?: Date;
  numberOfHolidays: number;
  useExtendedWeekends: boolean;
  finalDeliveryDays: number;
  globalContingency: number;
  excludeDays: boolean;
  excludeStartDate?: string;
  excludeEndDate?: string;
  excludeDescription?: string;

  editorial: {
    dataCollection: number;
    writing: number;
    subEditing: number;
    internalProofreading: number;
    clientReview1: number;
    clientReview2: number;
    clientReview3: number;
    finalReview: number;
    contingency: number;
    review1Name: string;
    review2Name: string;
    review3Name: string;
    skipReview1: boolean;
    skipReview2: boolean;
    skipReview3: boolean;
  };

  creative: {
    conceptualization: number;
    moodboardProduction: number;
    creativeReview: number;
    clientFeedbackRounds: number;
    daysPerRound: number;
    finalCreativeApproval: number;
  };

  design: {
    pages: number;
    layoutType: string;
    editorialProofreading: number;
    review1: number;
    review2: number;
    review3: number;
    contingency: number;
    approval: number;
    review1Name: string;
    review2Name: string;
    review3Name: string;
    skipReview1: boolean;
    skipReview2: boolean;
    skipReview3: boolean;
  };

  webDevelopment: {
    enabled: boolean;
    frontendDevelopment: number;
    backendIntegration: number;
    testing: number;
  };

  printProduction: {
    prePressProofing: number;
    printing: number;
    binding: number;
  };

  createdAt: Date;
  updatedAt: Date;
}

const TimelineSchema = new Schema<ITimeline>(
  {
    uniqueId: { type: String, required: true, unique: true, index: true },
    projectName: { type: String, required: true },
    clientName: { type: String, required: true },
    schedulingMethod: { type: String, enum: ['backward', 'forward'], required: true },
    startDate: { type: Date },
    endDate: { type: Date },
    numberOfHolidays: { type: Number, default: 0 },
    useExtendedWeekends: { type: Boolean, default: false },
    finalDeliveryDays: { type: Number, default: 0 },
    globalContingency: { type: Number, default: 0 },
    excludeDays: { type: Boolean, default: false },
    excludeStartDate: { type: String },
    excludeEndDate: { type: String },
    excludeDescription: { type: String },

    editorial: {
      dataCollection: { type: Number, default: 5 },
      writing: { type: Number, default: 10 },
      subEditing: { type: Number, default: 3 },
      internalProofreading: { type: Number, default: 2 },
      clientReview1: { type: Number, default: 3 },
      clientReview2: { type: Number, default: 3 },
      clientReview3: { type: Number, default: 3 },
      finalReview: { type: Number, default: 2 },
      contingency: { type: Number, default: 0 },
      review1Name: { type: String, default: 'Content review 1' },
      review2Name: { type: String, default: 'Content review 2' },
      review3Name: { type: String, default: 'Content review 3' },
      skipReview1: { type: Boolean, default: false },
      skipReview2: { type: Boolean, default: false },
      skipReview3: { type: Boolean, default: false },
    },

    creative: {
      conceptualization: { type: Number, default: 5 },
      moodboardProduction: { type: Number, default: 3 },
      creativeReview: { type: Number, default: 2 },
      clientFeedbackRounds: { type: Number, default: 2 },
      daysPerRound: { type: Number, default: 3 },
      finalCreativeApproval: { type: Number, default: 1 },
    },

    design: {
      pages: { type: Number, default: 40 },
      layoutType: { type: String, default: 'text-based' },
      editorialProofreading: { type: Number, default: 2 },
      review1: { type: Number, default: 4 },
      review2: { type: Number, default: 4 },
      review3: { type: Number, default: 4 },
      contingency: { type: Number, default: 2 },
      approval: { type: Number, default: 2 },
      review1Name: { type: String, default: 'Client review & amends 1' },
      review2Name: { type: String, default: 'Client review & amends 2' },
      review3Name: { type: String, default: 'Client review & amends 3' },
      skipReview1: { type: Boolean, default: false },
      skipReview2: { type: Boolean, default: false },
      skipReview3: { type: Boolean, default: false },
    },

    webDevelopment: {
      enabled: { type: Boolean, default: false },
      frontendDevelopment: { type: Number, default: 10 },
      backendIntegration: { type: Number, default: 5 },
      testing: { type: Number, default: 3 },
    },

    printProduction: {
      prePressProofing: { type: Number, default: 3 },
      printing: { type: Number, default: 5 },
      binding: { type: Number, default: 2 },
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.Timeline || mongoose.model<ITimeline>('Timeline', TimelineSchema);
