import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import stagesRouter from "./stages";
import aiRouter from "./ai";
import agentsRouter from "./agents";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clientsRouter);
router.use(stagesRouter);
router.use(aiRouter);
router.use(agentsRouter);

export default router;
