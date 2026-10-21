import mongoose from "mongoose";

const partySchema = new mongoose.Schema(
  {
    partyCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    contactPerson: {
      type: String,
      default: "",
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    address: {
      type: String,
      required: true,
      trim: true,
    },

    location: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
    },

    assignedSalesmanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

partySchema.index({ name: "text", partyCode: "text" });
partySchema.index({ assignedSalesmanId: 1, isActive: 1 });

export default mongoose.model("Party", partySchema);