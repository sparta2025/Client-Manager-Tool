import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import stagesRouter from "./stages";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clientsRouter);
router.use(stagesRouter);
router.use(aiRouter);

export default router;
