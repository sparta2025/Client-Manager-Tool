import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import stagesRouter from "./stages";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clientsRouter);
router.use(stagesRouter);

export default router;
