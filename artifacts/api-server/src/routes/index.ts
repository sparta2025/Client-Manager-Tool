import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import stagesRouter from "./stages";
import aiRouter from "./ai";
import agentsRouter from "./agents";
import teamRouter from "./team";
import { requireActiveUser, requireClerkUser } from "../middlewares/auth";
import { getCurrentTeamMember } from "./team";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireClerkUser);
router.get("/team/me", getCurrentTeamMember);
router.use(requireActiveUser);
router.use(teamRouter);
router.use(clientsRouter);
router.use(stagesRouter);
router.use(aiRouter);
router.use(agentsRouter);

export default router;
