import { builder } from "./builder"
import "./types/errors"
import "./types/user"
import "./types/auth"
import "./types/group"
import "./types/sports"
import "./types/question"

builder.queryType({})

export const schema = builder.toSchema()
