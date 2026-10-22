import {
  createImportPreview,
  commitImport,
} from "./import.service.js";

export async function previewImport(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "Upload an .xlsx or .csv file.",
      });
    }

    const result = await createImportPreview({
      file: req.file,
      entityType: req.body.entityType,
      userId: req.user.id,
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function confirmImport(req, res, next) {
  try {
    const result = await commitImport({
      importId: req.params.id,
      userId: req.user.id,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}