
import mongoose from "mongoose";

const importSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ["products", "parties"],
      required: true,
    },

    fileName: {
      type: String,
      required: true,
    },

    rows: {
      type: [mongoose.Schema.Types.Mixed],
      required: true,
    },

    errors: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    status: {
      type: String,
      enum: ["previewed", "committed", "failed"],
      default: "previewed",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    summary: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

importSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

export default mongoose.model("ImportJob", importSchema);
