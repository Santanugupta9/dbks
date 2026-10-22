
import * as orderService from "./order.service.js";

function handleError(next, error) {
  next(error);
}

export async function createOrder(req, res, next) {
  try {
    const order = await orderService.createOrder(req.body, req.user);
    res.status(201).json({
      message: "Order created successfully.",
      order,
    });
  } catch (error) {
    handleError(next, error);
  }
}

export async function listOrders(req, res, next) {
  try {
    const result = await orderService.listOrders(req.query, req.user);
    res.status(200).json(result);
  } catch (error) {
    handleError(next, error);
  }
}

export async function getOrder(req, res, next) {
  try {
    const order = await orderService.getOrder(req.params.id, req.user);
    res.status(200).json({ order });
  } catch (error) {
    handleError(next, error);
  }
}

export async function updateOrder(req, res, next) {
  try {
    const order = await orderService.updatePendingOrder(
      req.params.id,
      req.body,
      req.user
    );

    res.status(200).json({
      message: "Pending order updated successfully.",
      order,
    });
  } catch (error) {
    handleError(next, error);
  }
}

export async function confirmOrder(req, res, next) {
  try {
    const order = await orderService.confirmOrder(req.params.id, req.user);
    res.status(200).json({
      message: "Order confirmed successfully.",
      order,
    });
  } catch (error) {
    handleError(next, error);
  }
}

export async function cancelOrder(req, res, next) {
  try {
    const order = await orderService.cancelOrder(
      req.params.id,
      req.body,
      req.user
    );

    res.status(200).json({
      message: "Order cancelled successfully.",
      order,
    });
  } catch (error) {
    handleError(next, error);
  }
}

export async function requestAmendment(req, res, next) {
  try {
    const order = await orderService.requestAmendment(
      req.params.id,
      req.body,
      req.user
    );

    res.status(201).json({
      message: "Amendment request submitted successfully.",
      order,
    });
  } catch (error) {
    handleError(next, error);
  }
}
