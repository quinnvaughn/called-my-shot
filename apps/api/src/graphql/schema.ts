import { builder } from "./builder"
import "./types/errors"
import "./types/pagination"
import "./types/user"
import "./types/auth"
import "./types/group"
import "./types/leaderboard"
import "./types/sports"
import "./types/question"
import "./types/ballot"
import "./types/notification"
import "./types/support"

builder.queryType({})

export const schema = builder.toSchema()
